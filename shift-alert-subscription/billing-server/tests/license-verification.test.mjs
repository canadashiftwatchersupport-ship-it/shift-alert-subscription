import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";

function createDb() {
  const license = {
    token: "valid-token",
    email: "customer@gmail.com",
    plan: "week",
    amount: 3600,
    active: 1,
    status: "completed",
    payment_link_id: "payment-1",
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  const statement = (sql, values = []) => ({
    bind(...nextValues) { return statement(sql, nextValues); },
    async run() { return { meta: { changes: 0 } }; },
    async first() {
      if (!/FROM licenses/i.test(sql)) return null;
      return values[0] === license.token && values[1] === license.email ? license : null;
    },
  });
  return { prepare: sql => statement(sql) };
}

test("verifies a license when the customer capitalizes or spaces their email and token", async () => {
  const response = await worker.fetch(new Request("https://worker.example/v1/licenses/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "  Customer@GMAIL.com ", token: " valid-token " }),
  }), { DB: createDb() });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.active, true);
  assert.equal(result.email, "customer@gmail.com");
});
