const SEARCH_URL = "https://hiring.amazon.ca/app#/jobSearch";
const ALARM = "amazon-canada-shift-scan";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ enabled: false, seen: {}, intervalMinutes: 1, autoPrepare: false, acceptAlternative: false, jobType: "any", locationPreference: "", anywhereCanada: false });
});

async function setAlarm(enabled, intervalMinutes = 1) {
  await chrome.alarms.clear(ALARM);
  if (enabled) {
    await chrome.alarms.create(ALARM, {
      delayInMinutes: 0.05,
      periodInMinutes: Math.max(0.5, Number(intervalMinutes) || 1)
    });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "set-enabled") {
    chrome.storage.local
      .set({
        enabled: message.enabled,
        intervalMinutes: message.intervalMinutes,
        autoPrepare: Boolean(message.autoPrepare),
        acceptAlternative: Boolean(message.acceptAlternative),
        jobType: message.jobType || "any",
        locationPreference: (message.locationPreference || "").trim(),
        anywhereCanada: Boolean(message.anywhereCanada),
        ...(message.enabled && message.resetSeen ? { seen: {} } : {})
      })
      .then(() => setAlarm(message.enabled, message.intervalMinutes))
      .then(async () => {
        if (message.enabled) {
          const tabs = await chrome.tabs.query({ url: "https://hiring.amazon.ca/*" });
          const searchTabs = tabs.filter(tab => (tab.url || "").includes("/app#/jobSearch"));
          await Promise.allSettled(searchTabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: "scan-now" })));
        }
        sendResponse({ ok: true });
      });
    return true;
  }

  if (message.type === "open-search") {
    chrome.tabs.create({ url: SEARCH_URL });
    sendResponse({ ok: true });
    return;
  }

  if (message.type === "resume-watching") {
    chrome.storage.local.get("intervalMinutes").then(async settings => {
      await chrome.storage.local.set({
        enabled: true,
        applicationAutomation: { active: false, phase: "watching" }
      });
      await setAlarm(true, settings.intervalMinutes || 1);
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === "jobs-found") {
    handleJobs(message.jobs, sender.tab).then(result => sendResponse({
      ok: true,
      prepareJobId: result?.requiresCardClick ? result.id : null
    })).catch(error => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (message.type === "stopped-at-submit") {
    chrome.notifications.create("amazon-shift:submit-ready", {
      type: "basic",
      iconUrl: "icon.svg",
      title: "Amazon application ready for review",
      message: "Automation stopped at Submit. Review every detail and decide whether to submit manually.",
      priority: 2,
      requireInteraction: true
    });
    sendResponse({ ok: true });
  }
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM) return;
  const { enabled } = await chrome.storage.local.get("enabled");
  if (!enabled) return;

  const tabs = await chrome.tabs.query({ url: "https://hiring.amazon.ca/*" });
  const searchTab = tabs.find(tab => (tab.url || "").includes("/app#/jobSearch"));
  if (searchTab?.id) {
    await chrome.tabs.reload(searchTab.id);
  }
});

async function handleJobs(jobs, sourceTab) {
  if (!Array.isArray(jobs) || jobs.length === 0) return;
  const currentSettings = await chrome.storage.local.get(["enabled", "autoPrepare"]);
  if (!currentSettings.enabled) return;
  const stored = await chrome.storage.local.get("seen");
  const seen = stored.seen || {};

  let firstNewJob = null;
  for (const job of jobs) {
    if (!job.id || seen[job.id]) continue;
    if (!firstNewJob) firstNewJob = job;
    seen[job.id] = Date.now();
    const notificationId = `amazon-shift:${job.id}`;
    await chrome.storage.local.set({
      [`notification:${notificationId}`]: {
        url: job.url || sourceTab?.url || SEARCH_URL,
        tabId: sourceTab?.id
      }
    });
    try {
      await chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: "icon.svg",
        title: job.location ? `Amazon shift — ${job.location}` : "Amazon Canada shift available",
        message: [job.schedule, job.pay, job.title].filter(Boolean).join(" • ") || "Open the listing to review and confirm manually.",
        contextMessage: "Click to open the Amazon listing",
        priority: 2,
        requireInteraction: true
      });
    } catch (error) {
      console.warn("Notification could not be displayed", error);
    }
  }

  const entries = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 500);
  await chrome.storage.local.set({ seen: Object.fromEntries(entries) });

  const settings = currentSettings;
  if (firstNewJob && settings.autoPrepare && settings.enabled) {
    await chrome.storage.local.set({
      enabled: false,
      applicationAutomation: {
        active: true,
        phase: "open-listing",
        jobId: firstNewJob.id,
        startedAt: Date.now()
      }
    });
    await chrome.alarms.clear(ALARM);
    if (sourceTab?.id && firstNewJob.requiresCardClick) {
      await chrome.tabs.update(sourceTab.id, { active: true });
      const updatedTab = await chrome.tabs.get(sourceTab.id);
      await chrome.windows.update(updatedTab.windowId, { focused: true });
    } else if (sourceTab?.id) {
      await chrome.tabs.update(sourceTab.id, { active: true, url: firstNewJob.url });
      const updatedTab = await chrome.tabs.get(sourceTab.id);
      await chrome.windows.update(updatedTab.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: firstNewJob.url, active: true });
    }
  }
  return firstNewJob;
}

chrome.notifications.onClicked.addListener(async notificationId => {
  if (!notificationId.startsWith("amazon-shift:")) return;
  const key = `notification:${notificationId}`;
  const stored = await chrome.storage.local.get(key);
  const target = stored[key] || {};
  if (target.tabId) {
    try {
      await chrome.tabs.update(target.tabId, { active: true, url: target.url });
      const tab = await chrome.tabs.get(target.tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
    } catch {
      await chrome.tabs.create({ url: target.url || SEARCH_URL });
    }
  } else {
    await chrome.tabs.create({ url: target.url || SEARCH_URL });
  }
  await chrome.notifications.clear(notificationId);
});
