const status = document.querySelector("#status");
const licenseView = document.querySelector("#licenseView");
const settingsView = document.querySelector("#settingsView");
const email = document.querySelector("#email");
const token = document.querySelector("#token");
const watching = document.querySelector("#watching");
const interval = document.querySelector("#interval");
const autoPrepare = document.querySelector("#autoPrepare");
const acceptAlternative = document.querySelector("#acceptAlternative");
const jobType = document.querySelector("#jobType");
const locationPreference = document.querySelector("#location");
const anywhereCanada = document.querySelector("#anywhereCanada");

function showSettings() {
  licenseView.hidden = true;
  settingsView.hidden = false;
  // Explicit display styles make the transition reliable in unpacked and
  // downloaded builds even when a browser retains the previous popup DOM.
  licenseView.style.display = "none";
  settingsView.style.display = "block";
  chrome.storage.local.get(["watching", "intervalMinutes", "autoPrepare", "acceptAlternative", "jobType", "locationPreference", "anywhereCanada"], data => {
    watching.checked = Boolean(data.watching);
    interval.value = String(data.intervalMinutes || 1);
    autoPrepare.checked = Boolean(data.autoPrepare);
    acceptAlternative.checked = Boolean(data.acceptAlternative);
    jobType.value = data.jobType || "any";
    locationPreference.value = data.locationPreference || "";
    anywhereCanada.checked = Boolean(data.anywhereCanada);
    locationPreference.disabled = anywhereCanada.checked;
  });
}

document.querySelector("#activate").onclick = () => {
  const button = document.querySelector("#activate");
  button.disabled = true;
  chrome.runtime.sendMessage({ type: "save-license", email: email.value.trim(), token: token.value.trim() }, result => {
    button.disabled = false;
    if (chrome.runtime.lastError || !result?.ok) {
      status.textContent = result?.message || "Could not reach the license server.";
      return;
    }
    status.textContent = `Active until ${new Date(result.license.expiresAt).toLocaleString()}`;
    showSettings();
  });
};

function watcherSettings() {
  return {
    intervalMinutes: Number(interval.value),
    autoPrepare: autoPrepare.checked,
    acceptAlternative: acceptAlternative.checked,
    jobType: jobType.value,
    locationPreference: locationPreference.value.trim(),
    anywhereCanada: anywhereCanada.checked
  };
}

watching.onchange = event => chrome.runtime.sendMessage({ type: "set-watching", enabled: event.target.checked, ...watcherSettings(), resetSeen: true }, result => {
  if (chrome.runtime.lastError || !result?.ok) {
    event.target.checked = false;
    status.textContent = result?.message || "Activate a license first.";
  }
});

document.querySelector("#save").onclick = () => chrome.runtime.sendMessage({
  type: "set-enabled", enabled: watching.checked, ...watcherSettings(), resetSeen: true
}, result => { status.textContent = result?.ok ? (watching.checked ? "Watcher is running and scanning now." : "Watcher is stopped.") : (result?.message || "Could not save settings."); });

anywhereCanada.onchange = () => { locationPreference.disabled = anywhereCanada.checked; };
document.querySelector("#open").onclick = () => { chrome.tabs.create({ url: "https://hiring.amazon.ca/app#/jobSearch" }); window.close(); };
const resume = document.querySelector("#resume");
if (resume) resume.onclick = () => chrome.runtime.sendMessage({ type: "resume-watching" }, result => {
  if (result?.ok) { watching.checked = true; status.textContent = "Current application skipped. Watcher resumed."; }
  else status.textContent = result?.message || "Could not resume the watcher.";
});
document.querySelectorAll("[data-plan]").forEach(button => button.onclick = () => {
  const url = button.dataset.plan === "day" ? SHIFT_ALERT_CONFIG.dayPassCheckoutUrl : SHIFT_ALERT_CONFIG.monthlyCheckoutUrl;
  if (url) chrome.tabs.create({ url }); else status.textContent = "Checkout links are not configured yet.";
});

chrome.storage.local.get("license", data => {
  if (data.license?.active && new Date(data.license.expiresAt) > new Date()) showSettings();
});
