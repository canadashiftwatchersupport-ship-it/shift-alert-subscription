const AMAZON_ACCOUNT_URL = 'https://hiring.amazon.ca/app#/contactInformation';
let accountCheckPending = null;

async function pauseForAccount(message) {
  await chrome.storage.local.set({ enabled: false, watching: false, accountStatus: message, applicationAutomation: { active: false, phase: 'account-check-required' } });
  await chrome.alarms.clear('amazon-canada-shift-scan');
  return { ok: false, message };
}

async function readCurrentAmazonAccount() {
  const tab = await chrome.tabs.create({ url: AMAZON_ACCOUNT_URL, active: false });
  try {
    for (let attempt = 0; attempt < 40; attempt++) {
      const state = await chrome.tabs.get(tab.id);
      if (state.status === 'complete' && state.url?.startsWith(AMAZON_ACCOUNT_URL)) {
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'read-amazon-account' }).catch(() => null);
        if (result?.ok && /^[a-f0-9]{64}$/.test(result.accountHash)) return result.accountHash;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error('Open Amazon Contact information and sign in, then try again.');
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function verifyCurrentAmazonAccount(bind = false) {
  // Share concurrent checks, but never reuse a previous completed account reading.
  if (accountCheckPending) {
    if (!bind) return accountCheckPending;
    await accountCheckPending;
    return verifyCurrentAmazonAccount(true);
  }
  const run = async () => {
    try {
      const { license } = await chrome.storage.local.get('license');
      if (!license?.token || !license.active || Date.parse(license.expiresAt) <= Date.now()) return pauseForAccount('Activate a valid license first.');
      const accountHash = await readCurrentAmazonAccount();
      const response = await fetch(`${SHIFT_ALERT_CONFIG.licenseApiBase}/v1/licenses/amazon-account`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: license.email, token: license.token, accountHash, bind })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) return pauseForAccount(result.message || 'Account verification failed.');
      await chrome.storage.local.set({ accountStatus: 'Amazon account verified.' });
      return { ok: true };
    } catch {
      return pauseForAccount('Could not verify your Amazon account. Sign in to Amazon and try again.');
    }
  };
  accountCheckPending = run();
  try { return await accountCheckPending; }
  finally { accountCheckPending = null; }
}

function registerAccountProtectedListener(listener) {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    const isContent = sender.tab && sender.url?.startsWith('https://hiring.amazon.ca/');
    const isPopup = !sender.tab && sender.id === chrome.runtime.id;
    if (message.type === 'bind-amazon-account') {
      if (!isPopup) { reply({ ok: false }); return; }
      verifyCurrentAmazonAccount(true).then(reply); return true;
    }
    const needsCheck = message.type === 'check-amazon-account' ||
      (message.type === 'jobs-found' && message.jobs?.length) ||
      (['set-enabled', 'set-watching'].includes(message.type) && message.enabled) ||
      message.type === 'resume-watching';
    if (needsCheck) {
      if (!isContent && !isPopup) { reply({ ok: false }); return; }
      verifyCurrentAmazonAccount().then(result => {
        if (!result.ok || message.type === 'check-amazon-account') reply(result);
        else listener(message, sender, reply);
      });
      return true;
    }
    return listener(message, sender, reply);
  });
}
