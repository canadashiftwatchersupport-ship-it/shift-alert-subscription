import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

function createDb(license) {
  const state = { license: { ...license }, revocation: null, batches: 0 };
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind(...nextValues) { return statement(sql, nextValues); },
    async first() {
      if (/FROM licenses\s+WHERE token/i.test(sql)) {
        return state.license.token === values[0] && state.license.email.toLowerCase() === values[1]
          ? { ...state.license }
          : null;
      }
      if (/FROM licenses\s+WHERE lower\(email\)/i.test(sql)) {
        return state.license.email.toLowerCase() === values[0] ? { ...state.license } : null;
      }
      return null;
    },
    async run() { return { meta: { changes: 0 } }; },
  });
  return {
    state,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      state.batches += 1;
      for (const item of statements) {
        if (/UPDATE licenses/i.test(item.sql)) {
          state.license.active = 0;
          state.license.status = "refunded-revoked";
          state.license.expires_at = item.values[1];
        }
        if (/INSERT INTO license_revocations/i.test(item.sql)) {
          state.revocation = {
            license_token: item.values[0],
            email: item.values[1],
            previous_expires_at: item.values[2],
            revoked_at: item.values[3],
          };
        }
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

async function revoke(db, { email = "customer@example.com", token, secret = "admin-secret" } = {}) {
  const request = new Request("https://worker.example/v1/admin/licenses/revoke", {
    method: "POST",
    headers: { "content-type": "application/json", "x-manual-license-secret": secret },
    body: JSON.stringify({ email, ...(token ? { token } : {}) }),
  });
  return worker.fetch(request, { DB: db, MANUAL_LICENSE_SECRET: "admin-secret" });
}

test("revokes the latest license using only the customer email", async () => {
  const oldExpiry = new Date(Date.now() + 4 * 86400000).toISOString();
  const db = createDb({ token: "license-token", email: "customer@example.com", plan: "week", active: 1, status: "completed", expires_at: oldExpiry });
  const response = await revoke(db);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.revoked, true);
  assert.equal(result.previousExpiresAt, oldExpiry);
  assert.equal(db.state.license.active, 0);
  assert.equal(db.state.license.status, "refunded-revoked");
  assert.equal(db.state.revocation.license_token, "license-token");
});

test("repeating a revocation does not change it again", async () => {
  const db = createDb({ token: "license-token", email: "customer@example.com", plan: "week", active: 0, status: "refunded-revoked", expires_at: new Date().toISOString() });
  const response = await revoke(db);
  const result = await response.json();
  assert.equal(result.alreadyRevoked, true);
  assert.equal(db.state.batches, 0);
});

test("rejects a revocation with the wrong admin secret", async () => {
  const db = createDb({ token: "license-token", email: "customer@example.com", plan: "week", active: 1, status: "completed", expires_at: new Date().toISOString() });
  const response = await revoke(db, { secret: "wrong-secret" });
  assert.equal(response.status, 401);
  assert.equal(db.state.batches, 0);
});
