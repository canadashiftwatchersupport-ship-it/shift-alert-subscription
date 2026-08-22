(() => {
  if (window.__amazonCanadaShiftWatcherLoaded) return;
  window.__amazonCanadaShiftWatcherLoaded = true;

  const clean = value => (value || "").replace(/\s+/g, " ").trim();
  const hash = value => {
    let result = 2166136261;
    for (let i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  };

  // Amazon does not expose credentials. When the signed-in page visibly
  // exposes an email/account link, use a one-way fingerprint to bind the
  // license to that account. If no stable identifier is visible, return null
  // rather than guessing.
  function visibleAmazonAccountKey() {
    const identityElement = document.querySelector("[data-account-id], [data-user-id], [data-customer-id], [data-identity-id]");
    const identity = identityElement && ["data-account-id", "data-user-id", "data-customer-id", "data-identity-id"]
      .map(attribute => identityElement.getAttribute(attribute)).find(Boolean);
    if (identity) return hash(identity.trim().toLowerCase());
    const accountElement = [...document.querySelectorAll("a,button,[role='button'],[aria-label]")]
      .find(element => /signed in as|my account.*@|account settings.*@/i.test(clean(element.innerText || element.getAttribute("aria-label") || element.title)));
    const accountText = clean(accountElement?.innerText || accountElement?.getAttribute("aria-label") || accountElement?.title);
    const email = accountText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    if (email) return hash(email.toLowerCase());
    return null;
  }

  function extractField(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return clean(match[1] || match[0]);
    }
    return "";
  }

  async function scan() {
    const noJobs = /no jobs available that match your search/i.test(document.body.innerText);
    if (noJobs) return [];

    const preferences = await chrome.storage.local.get(["jobType", "locationPreference", "anywhereCanada"]);
    const requestedType = preferences.jobType || "any";
    const requestedLocations = (preferences.anywhereCanada ? "" : (preferences.locationPreference || ""))
      .split(/[\n,;]+/)
      .map(value => clean(value).toLowerCase())
      .filter(Boolean);

    const links = [...document.querySelectorAll("a[href], [role='link']")].filter(link => {
      const href = link.href || "";
      const text = clean(link.innerText);
      return text.length > 8 && (
        /job|requisition|application/i.test(href) ||
        /\d+\s+shifts?\s+available/i.test(text) ||
        link.classList.contains("jobCardItem")
      );
    });

    const jobs = [];
    const used = new Set();
    window.__amazonJobElements = new Map();
    for (const link of links.slice(0, 100)) {
      const card = link.closest("article, li, [role='link'], [data-testid*='job'], [class*='job-card'], [class*='jobCard']") || link.parentElement;
      const text = clean(card?.innerText || link.innerText);
      if (text.length < 15 || text.length > 2500) continue;
      const comparable = text.toLowerCase();
      if (requestedLocations.length && !requestedLocations.some(location => comparable.includes(location))) continue;
      if (requestedType === "full-time" && !/\bfull[\s-]?time\b/i.test(text)) continue;
      if (requestedType === "part-time" && !/\bpart[\s-]?time\b/i.test(text)) continue;

      const location = extractField(text, [
        /(?:location|workplace|site|address)\s*[:\-]?\s*([^|•\n]{3,100})/i,
        /([^|•\n,]{2,60},\s*(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT))\b/i
      ]);
      const pay = extractField(text, [/(\$\s*\d+(?:\.\d{1,2})?\s*(?:\/|per)\s*(?:hr|hour))/i]);
      const schedule = extractField(text, [
        /((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^|•\n]{0,100}(?:AM|PM))/i,
        /((?:day|night|evening|weekend|overnight)\s+shift[^|•\n]{0,80})/i
      ]);
      const title = clean(link.innerText).slice(0, 140);
      const url = link.href || location.href;
      const id = hash(`${url}|${location}|${schedule}|${pay}|${title}`);
      if (used.has(id)) continue;
      used.add(id);
      window.__amazonJobElements.set(id, link);
      jobs.push({ id, title, location, schedule, pay, url, requiresCardClick: !link.href });
    }
    return jobs;
  }

  async function report() {
    if (location.hash.includes("/jobSearch") && !window.__amazonAllJobsActivated) {
      const allButtons = exactAction("All");
      if (allButtons.length === 1) {
        window.__amazonAllJobsActivated = true;
        allButtons[0].click();
        setTimeout(report, 100);
        return;
      }
    }
    const jobs = await scan();
    try {
      const response = await chrome.runtime.sendMessage({ type: "jobs-found", jobs, accountKey: visibleAmazonAccountKey() });
      if (response?.prepareJobId) {
        const element = window.__amazonJobElements?.get(response.prepareJobId);
        if (element && visible(element)) element.click();
      }
    } catch (error) {
      console.warn("Shift watcher could not prepare the listing", error);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "scan-now") return;
    Promise.all([report(), scheduleFastRefresh()]).then(() => sendResponse({ ok: true })).catch(error => {
      console.warn("Immediate scan failed", error);
      sendResponse({ ok: false });
    });
    return true;
  });

  const visible = element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0 && !element.disabled;
  };

  // Amazon renders these controls in a few different ways (plain text,
  // aria-label, or a title). Use all three so a redesign does not strand the
  // automation on the schedule panel.
  const actionLabel = element => clean(element.innerText) ||
    clean(element.getAttribute("aria-label")) ||
    clean(element.title);
  const exactAction = label => [...document.querySelectorAll("button, a, [role='button']")]
    .filter(element => visible(element) && actionLabel(element).toLowerCase() === label.toLowerCase());

  function payForScheduleAction(button) {
    let node = button.parentElement;
    for (let depth = 0; node && depth < 8; depth++, node = node.parentElement) {
      const text = clean(node.innerText);
      if (text.length > 2500) continue;
      const amounts = [...text.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)]
        .map(match => Number(match[1]))
        .filter(Number.isFinite);
      if (amounts.length) return Math.max(...amounts);
    }
    return -1;
  }

  function highestPayingAction(buttons) {
    return buttons.reduce((best, button) => {
      const pay = payForScheduleAction(button);
      return !best || pay > best.pay ? { button, pay } : best;
    }, null)?.button || buttons[0];
  }

  async function prepareApplication() {
    const { autoPrepare, acceptAlternative, applicationAutomation } = await chrome.storage.local.get(["autoPrepare", "acceptAlternative", "applicationAutomation"]);
    if (!autoPrepare || !applicationAutomation?.active) return;

    const alternativeButtons = [
      ...exactAction("Accept offer"),
      ...exactAction("Accept this offer"),
      ...exactAction("Accept alternative offer"),
      ...exactAction("Select shift")
    ];
    if (acceptAlternative && alternativeButtons.length === 1 && applicationAutomation.phase === "created-application") {
      await chrome.storage.local.set({
        applicationAutomation: { ...applicationAutomation, phase: "accepted-alternative" }
      });
      alternativeButtons[0].click();
      return;
    }

    const pageText = clean(document.body.innerText).toLowerCase();
    const unavailable = pageText.includes("this job is not available for application now") ||
      pageText.includes("0 schedules found") ||
      pageText.includes("there are no schedules that match your filter choices") ||
      pageText.includes("all shifts have been filled for this job");
    if (unavailable && !window.__amazonReturningToSearch) {
      window.__amazonReturningToSearch = true;
      await chrome.storage.local.set({
        applicationAutomation: { ...applicationAutomation, active: false, phase: "unavailable" }
      });
      await chrome.runtime.sendMessage({ type: "resume-watching" });
      location.href = "https://hiring.amazon.ca/app#/jobSearch";
      return;
    }

    // Final boundary: never click Submit. Stop as soon as it is visible.
    if (exactAction("Submit").length > 0 || exactAction("Submit application").length > 0) {
      await chrome.storage.local.set({
        applicationAutomation: { ...applicationAutomation, active: false, phase: "stopped-at-submit" }
      });
      chrome.runtime.sendMessage({ type: "stopped-at-submit" });
      return;
    }

    const confirmButtons = exactAction("Confirm");
    if (confirmButtons.length === 1 && !["created-application", "stopped-at-submit", "unavailable"].includes(applicationAutomation.phase)) {
      await chrome.storage.local.set({
        applicationAutomation: { ...applicationAutomation, phase: "confirmed-schedule" }
      });
      confirmButtons[0].click();
      return;
    }

    const applyButtons = exactAction("Apply");
    if (applyButtons.length > 0 && !["created-application", "stopped-at-submit", "unavailable"].includes(applicationAutomation.phase)) {
      await chrome.storage.local.set({
        applicationAutomation: { ...applicationAutomation, phase: "applied-schedule" }
      });
      const applyButton = highestPayingAction(applyButtons);
      applyButton.click();
      return;
    }

    const createButtons = exactAction("Create application");
    if (createButtons.length === 1 && !["open-listing", "select-shift", "schedule-panel-open", "watching", "stopped-at-submit", "unavailable"].includes(applicationAutomation.phase)) {
      await chrome.storage.local.set({
        applicationAutomation: { ...applicationAutomation, phase: "created-application" }
      });
      createButtons[0].click();
      return;
    }

    if (["open-listing", "select-shift"].includes(applicationAutomation.phase)) {
      const selectButtons = [
        ...exactAction("Select"),
        ...exactAction("Select this shift"),
        ...exactAction("Select schedule")
      ];
      if (selectButtons.length > 0) {
        await chrome.storage.local.set({
          applicationAutomation: { ...applicationAutomation, phase: "schedule-panel-open" }
        });
        selectButtons[0].click();
        // The schedule drawer is populated asynchronously. Give React/Amazon
        // a short window to render its Apply/Confirm controls, then retry.
        setTimeout(prepareApplication, 250);
      }
    }
  }

  async function resumeAfterRejection() {
    if (!location.hash.includes("/jobSearch")) return;
    const { autoPrepare, applicationAutomation } = await chrome.storage.local.get(["autoPrepare", "applicationAutomation"]);
    if (autoPrepare && applicationAutomation?.phase === "stopped-at-submit") {
      chrome.runtime.sendMessage({ type: "resume-watching" });
    }
  }

  async function scheduleFastRefresh() {
    clearTimeout(window.__amazonFastRefreshTimer);
    if (!location.hash.includes("/jobSearch")) return;
    const { enabled, intervalMinutes } = await chrome.storage.local.get(["enabled", "intervalMinutes"]);
    const minutes = Number(intervalMinutes) || 1;
    if (!enabled || minutes >= 0.5) return;
    window.__amazonFastRefreshTimer = setTimeout(async () => {
      const latest = await chrome.storage.local.get("enabled");
      if (latest.enabled && location.hash.includes("/jobSearch")) {
        location.reload();
      }
    }, Math.max(10000, Math.round(minutes * 60000)));
  }

  setTimeout(report, 150);
  setTimeout(prepareApplication, 150);
  setTimeout(resumeAfterRejection, 150);
  setTimeout(scheduleFastRefresh, 200);
  const observer = new MutationObserver(() => {
    clearTimeout(window.__amazonWatcherDebounce);
    window.__amazonWatcherDebounce = setTimeout(report, 75);
    clearTimeout(window.__amazonPrepareDebounce);
    window.__amazonPrepareDebounce = setTimeout(prepareApplication, 50);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
