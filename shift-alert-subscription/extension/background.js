importScripts("config.js");

const ALARM = "shift-alert-scan";

async function activeLicense() {
  const { license } = await chrome.storage.local.get("license");
  return Boolean(license?.active && new Date(license.expiresAt) > new Date());
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "save-license") {
    verifyLicense(message.email, message.token).then(result => sendResponse(result));
    return true;
  }
  if (message.type === "set-watching") {
    setWatching(Boolean(message.enabled)).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message.type === "save-settings") {
    chrome.storage.local.set({
      intervalMinutes: Number(message.intervalMinutes) || 1,
      autoPrepare: Boolean(message.autoPrepare),
      acceptAlternative: Boolean(message.acceptAlternative),
      jobType: message.jobType || "any",
      locationPreference: (message.locationPreference || "").trim(),
      anywhereCanada: Boolean(message.anywhereCanada)
    }).then(() => sendResponse({ ok: true })).catch(error => sendResponse({ ok: false, message: error.message }));
    return true;
  }
  if (message.type === "jobs-found") {
    notifyJobs(message.jobs, sender.tab).then(() => sendResponse({ ok: true }));
    return true;
  }
});

importScripts("config.js");

async function verifyLicense(email, token) {
  try {
    const response = await fetch(`${SHIFT_ALERT_CONFIG.licenseApiBase}/v1/licenses/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, token })
    });
    const license = await response.json();
    if (!response.ok || !license.active) return { ok: false, message: license.message || "License not active." };
    await chrome.storage.local.set({ license });
    return { ok: true, license };
  } catch { return { ok: false, message: "Could not reach the license server." }; }
}

async function setWatching(enabled) {
  if (enabled && !await activeLicense()) throw new Error("An active license is required.");
  await chrome.storage.local.set({ watching: enabled });
  await chrome.alarms.clear(ALARM);
  if (enabled) await chrome.alarms.create(ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM || !await activeLicense()) return;
  const tabs = await chrome.tabs.query({ url: "https://hiring.amazon.ca/app*" });
  for (const tab of tabs) if (tab.id) chrome.tabs.reload(tab.id);
});

async function notifyJobs(jobs, tab) {
  const { watching, seen = {} } = await chrome.storage.local.get(["watching", "seen"]);
  if (!watching || !await activeLicense()) return;
  for (const job of jobs.slice(0, 5)) {
    if (seen[job.id]) continue;
    seen[job.id] = Date.now();
    await chrome.notifications.create(`job:${job.id}`, {
      type: "basic", iconUrl: "icon.svg", title: `Match: ${job.location || "Canada"}`,
      message: [job.title, job.pay, job.schedule].filter(Boolean).join(" • ") || "Open Amazon listing to review.",
      requireInteraction: true
    });
    await chrome.storage.local.set({ [`job:${job.id}`]: { tabId: tab?.id } });
  }
  await chrome.storage.local.set({ seen });
}

chrome.notifications.onClicked.addListener(async id => {
  const { [id]: job } = await chrome.storage.local.get(id);
  if (job?.tabId) await chrome.tabs.update(job.tabId, { active: true });
});
