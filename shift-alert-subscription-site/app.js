(function () {
  const config = window.CSW_CONFIG || {};

  function getValue(value, fallback) {
    return value && value !== fallback ? value : fallback;
  }

  function isConfigured(value, fallback) {
    return Boolean(value && value.trim && value.trim() && value !== fallback);
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((el) => {
      el.textContent = value;
    });
  }

  function setHref(selector, value, fallbackText) {
    document.querySelectorAll(selector).forEach((el) => {
      const hasValue = Boolean(value && value.trim && value.trim());
      if (hasValue) {
        el.href = value;
        el.removeAttribute("aria-disabled");
        el.classList.remove("is-disabled");
        const label = el.querySelector("[data-label]");
        if (label && fallbackText) label.textContent = fallbackText;
        if (!label && fallbackText) el.textContent = fallbackText;
        return;
      }

      el.href = "#";
      el.setAttribute("aria-disabled", "true");
      el.classList.add("is-disabled");
      const label = el.querySelector("[data-label]");
      if (label) label.textContent = "Coming soon";
      if (!label) el.textContent = "Coming soon";
    });
  }

  function setEmailLinks(selector, email) {
    document.querySelectorAll(selector).forEach((el) => {
      if (email && email !== "SUPPORT_EMAIL") {
        el.href = `mailto:${email}`;
        el.textContent = email;
        return;
      }

      el.href = "contact.html";
    });
  }

  const supportEmail = getValue(config.supportEmail, "SUPPORT_EMAIL");
  const businessName = getValue(config.businessName, "Canada Shift Watcher");
  const chromeUrl = getValue(config.chromeWebStoreUrl, "CHROME_WEB_STORE_URL");

  setText("[data-business-name]", businessName);
  setEmailLinks("[data-support-email]", supportEmail);
  setHref("[data-payment='day']", config.dayPassPaymentUrl, "Buy C$15 Day Pass");
  setHref("[data-payment='month']", config.monthPassPaymentUrl, "Buy C$75 30-Day Pass");
  setHref("[data-chrome-store]", chromeUrl, "Add to Chrome");

  document.querySelectorAll("a.is-disabled").forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });

  document.querySelectorAll("[data-payment], [data-chrome-store]").forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href");
      if (!href || href === "#") {
        event.preventDefault();
        const dialog = document.querySelector("#checkout-dialog");
        if (dialog && typeof dialog.showModal === "function") {
          dialog.showModal();
        }
      }
    });
  });

  const note = document.querySelector("[data-config-note]");
  if (note) {
    const hasPayments = isConfigured(config.dayPassPaymentUrl, "") || isConfigured(config.monthPassPaymentUrl, "");
    const hasStore = isConfigured(chromeUrl, "CHROME_WEB_STORE_URL");
    note.textContent = hasPayments || hasStore
      ? "Some links may still be marked Coming soon until you add all URLs in config.js."
      : "Add your payment links and Chrome Web Store URL in config.js before publishing.";
  }
})();
