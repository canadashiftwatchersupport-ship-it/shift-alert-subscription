const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'extension', 'account-binding.js'), 'utf8');

function harness() {
  let now = 100_000;
  let accountPageOpens = 0;
  let serverChecks = 0;
  let listener;
  const license = { active: true, token: 'token-one', email: 'customer@example.com', expiresAt: new Date(now + 100_000).toISOString() };
  const context = {
    Date: class extends Date { static now() { return now; } },
    SHIFT_ALERT_CONFIG: { licenseApiBase: 'https://example.test' },
    chrome: {
      storage: { local: {
        async get() { return { license }; },
        async set() {}
      } },
      alarms: { async clear() {} },
      tabs: {
        async create() { accountPageOpens++; return { id: accountPageOpens }; },
        async get(id) { return { id, status: 'complete', url: 'https://hiring.amazon.ca/app#/contactInformation' }; },
        async sendMessage() { return { ok: true, accountHash: 'a'.repeat(64) }; },
        async remove() {}
      },
      runtime: { id: 'extension-id', onMessage: { addListener(callback) { listener = callback; } } }
    },
    fetch: async () => { serverChecks++; return { ok: true, async json() { return { ok: true }; } }; },
    setTimeout(callback) { callback(); }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  vm.runInContext('registerAccountProtectedListener(() => {})', context);
  return {
    get accountPageOpens() { return accountPageOpens; },
    get serverChecks() { return serverChecks; },
    advance(milliseconds) { now += milliseconds; },
    changeLicense() { license.token = 'token-two'; },
    check(tabId) {
      return new Promise(resolve => listener(
        { type: 'check-amazon-account' },
        { tab: { id: tabId }, url: 'https://hiring.amazon.ca/app#/jobSearch' },
        resolve
      ));
    }
  };
}

test('reuses one account check for immediate shift actions in the same tab', async () => {
  const app = harness();
  assert.equal((await app.check(7)).ok, true);
  assert.equal((await app.check(7)).ok, true);
  assert.equal(app.accountPageOpens, 1);
  assert.equal(app.serverChecks, 1);
});

test('rechecks after the short window, in another tab, or for a new license', async () => {
  const app = harness();
  await app.check(7);
  await app.check(8);
  assert.equal(app.serverChecks, 2);
  app.advance(15_000);
  await app.check(8);
  assert.equal(app.serverChecks, 3);
  app.changeLicense();
  await app.check(8);
  assert.equal(app.serverChecks, 4);
});
