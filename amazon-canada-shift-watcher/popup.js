const enabled = document.querySelector("#enabled");
const interval = document.querySelector("#interval");
const autoPrepare = document.querySelector("#autoPrepare");
const acceptAlternative = document.querySelector("#acceptAlternative");
const jobType = document.querySelector("#jobType");
const locationPreference = document.querySelector("#location");
const anywhereCanada = document.querySelector("#anywhereCanada");
const status = document.querySelector("#status");

chrome.storage.local.get(["enabled", "intervalMinutes", "autoPrepare", "acceptAlternative", "jobType", "locationPreference", "anywhereCanada"], data => {
  enabled.checked = Boolean(data.enabled);
  interval.value = String(data.intervalMinutes || 1);
  autoPrepare.checked = Boolean(data.autoPrepare);
  acceptAlternative.checked = Boolean(data.acceptAlternative);
  jobType.value = data.jobType || "any";
  locationPreference.value = data.locationPreference || "";
  anywhereCanada.checked = Boolean(data.anywhereCanada);
  locationPreference.disabled = anywhereCanada.checked;
});

document.querySelector("#save").addEventListener("click", () => {
  chrome.runtime.sendMessage({
    type: "set-enabled",
    enabled: enabled.checked,
    intervalMinutes: Number(interval.value),
    autoPrepare: autoPrepare.checked,
    acceptAlternative: acceptAlternative.checked,
    jobType: jobType.value,
    locationPreference: locationPreference.value.trim(),
    anywhereCanada: anywhereCanada.checked,
    resetSeen: true
  }, response => {
    status.textContent = response?.ok ? (enabled.checked ? "Watcher is running and scanning now." : "Watcher is stopped.") : "Could not save settings.";
  });
});

anywhereCanada.addEventListener("change", () => {
  locationPreference.disabled = anywhereCanada.checked;
});

document.querySelector("#open").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "open-search" });
  window.close();
});

document.querySelector("#resume").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "resume-watching" }, response => {
    if (response?.ok) {
      enabled.checked = true;
      status.textContent = "Current application skipped. Watcher resumed.";
    } else {
      status.textContent = "Could not resume the watcher.";
    }
  });
});
