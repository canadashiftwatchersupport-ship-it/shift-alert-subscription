const status = document.querySelector("#status");
const email = document.querySelector("#email");
const token = document.querySelector("#token");
document.querySelector("#activate").onclick = () => chrome.runtime.sendMessage({ type: "save-license", email: email.value.trim(), token: token.value.trim() }, result => status.textContent = result.ok ? `Active until ${new Date(result.license.expiresAt).toLocaleString()}` : result.message);
document.querySelector("#watching").onchange = event => chrome.runtime.sendMessage({ type: "set-watching", enabled: event.target.checked }, result => { if (chrome.runtime.lastError || !result?.ok) { event.target.checked = false; status.textContent = result?.message || "Activate a license first."; } });
document.querySelectorAll("[data-plan]").forEach(button => button.onclick = () => { const url = button.dataset.plan === "day" ? SHIFT_ALERT_CONFIG.dayPassCheckoutUrl : SHIFT_ALERT_CONFIG.monthlyCheckoutUrl; if (url) chrome.tabs.create({ url }); else status.textContent = "Checkout links are not configured yet."; });
