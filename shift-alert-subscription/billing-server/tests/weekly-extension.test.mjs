import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

function createDb(license) {
  const state = { license: { ...license }, extension: null };
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
      if (/FROM license_extensions/i.test(sql)) return state.extension && { new_expires_at: state.extension.new_expires_at };
      return null;
    },
    async run() { return { meta: { changes: 0 } }; },
  });
  return {
    state,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      for (const item of statements) {
        if (/UPDATE licenses/i.test(item.sql)) {
          state.license.active = 1;
          state.license.status = "week-bonus-extended";
          state.license.expires_at = item.values[1];
        }
        if (/INSERT INTO license_extensions/i.test(item.sql)) {
          state.extension = {
            license_token: item.values[0],
            previous_expires_at: item.values[1],
            new_expires_at: item.values[2],
          };
        }
      }
      return statements.map(() => ({ success: true }));
    },
  };
}

async function extend(db, overrides = {}) {
  const request = new Request("https://worker.example/v1/admin/licenses/extend-week", {
    method: "POST",
    headers: { "content-type": "application/json", "x-manual-license-secret": "admin-secret" },
    body: JSON.stringify({ email: "customer@example.com", token: "weekly-token", ...overrides }),
  });
  return worker.fetch(request, { DB: db, MANUAL_LICENSE_SECRET: "admin-secret" });
}

test("adds seven days to a weekly license and keeps its token", async () => {
  const originalExpiry = new Date(Date.now() + 2 * 86400000).toISOString();
  const db = createDb({ token: "weekly-token", email: "customer@example.com", plan: "week", active: 1, expires_at: originalExpiry });
  const response = await extend(db);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.extended, true);
  assert.equal(result.token, "weekly-token");
  assert.equal(Date.parse(result.expiresAt) - Date.parse(originalExpiry), 7 * 86400000);
});

test("does not add the same weekly bonus twice", async () => {
  const db = createDb({ token: "weekly-token", email: "customer@example.com", plan: "week", active: 1, expires_at: new Date(Date.now() + 86400000).toISOString() });
  const first = await (await extend(db)).json();
  const second = await (await extend(db)).json();
  assert.equal(second.alreadyExtended, true);
  assert.equal(second.expiresAt, first.expiresAt);
});

test("rejects a weekly bonus for a 30-day license", async () => {
  const db = createDb({ token: "weekly-token", email: "customer@example.com", plan: "30-day", active: 1, expires_at: new Date(Date.now() + 86400000).toISOString() });
  const response = await extend(db);
  assert.equal(response.status, 400);
});
