import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

function createDb({ active = 1, binding = "a".repeat(64), expiresAt = new Date(Date.now() + 86400000).toISOString() } = {}) {
  const state = {
    license: { token: "license-token", email: "customer@example.com", active, expires_at: expiresAt },
    binding,
    audit: null,
  };
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind(...nextValues) { return statement(sql, nextValues); },
    async first() {
      if (/FROM licenses\s+WHERE token/i.test(sql)) {
        return values[0] === state.license.token && values[1] === state.license.email ? { ...state.license } : null;
      }
      if (/FROM licenses\s+WHERE lower\(email\)/i.test(sql)) {
        return values[0] === state.license.email ? { ...state.license } : null;
      }
      if (/FROM license_amazon_accounts/i.test(sql)) return state.binding ? { account_hash: state.binding } : null;
      return null;
    },
    async run() { return { meta: { changes: 0 } }; },
  });
  return {
    state,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      for (const item of statements) {
        if (/DELETE FROM license_amazon_accounts/i.test(item.sql)) state.binding = null;
        if (/INSERT INTO amazon_account_binding_resets/i.test(item.sql)) {
          state.audit = { token: item.values[0], email: item.values[1], previousHash: item.values[2], resetAt: item.values[3] };
        }
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

async function reset(db, { email = "customer@example.com", secret = "admin-secret" } = {}) {
  return worker.fetch(new Request("https://worker.example/v1/admin/licenses/reset-amazon-account", {
    method: "POST",
    headers: { "content-type": "application/json", "x-manual-license-secret": secret },
    body: JSON.stringify({ email }),
  }), { DB: db, MANUAL_LICENSE_SECRET: "admin-secret" });
}

test("clears the current Amazon binding using only the customer email", async () => {
  const db = createDb();
  const response = await reset(db);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.reset, true);
  assert.equal(result.token, "license-token");
  assert.equal(db.state.binding, null);
  assert.equal(db.state.audit.previousHash, "a".repeat(64));
});

test("reports success when the license is already unbound", async () => {
  const db = createDb({ binding: null });
  const result = await (await reset(db)).json();
  assert.equal(result.alreadyReset, true);
  assert.equal(db.state.audit, null);
});

test("does not reset an inactive license", async () => {
  const db = createDb({ active: 0 });
  const response = await reset(db);
  assert.equal(response.status, 400);
  assert.notEqual(db.state.binding, null);
});
