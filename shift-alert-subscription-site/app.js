(function () {
  const config = window.CSW_CONFIG || {};
  const licenseApiBase = String(config.licenseApiBase || "").replace(/\/+$/, "");
  let paypalSdkPromise;

  function getValue(value, fallback) {
    return value && value !== fallback ? value : fallback;
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
  setHref("[data-payment='day']", "#checkout", "Buy C$27 7-Day Pass");
  setHref("[data-payment='month']", "#checkout", "Buy C$72 30-Day Pass");
  setHref("[data-chrome-store]", chromeUrl, "Add to Chrome");

  document.querySelectorAll("a.is-disabled").forEach((link) => {
    link.addEventListener("click", (event) => event.preventDefault());
  });

  function loadPayPalSdk() {
    if (paypalSdkPromise) return paypalSdkPromise;
    paypalSdkPromise = fetch(`${licenseApiBase}/v1/paypal/config`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Checkout configuration unavailable.")))
      .then((paypalConfig) => new Promise((resolve, reject) => {
        if (!paypalConfig.clientId) return reject(new Error("PayPal client ID is not configured."));
        const script = document.createElement("script");
        script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(paypalConfig.clientId)}&currency=CAD&intent=capture&components=buttons`;
        script.onload = () => resolve(window.paypal);
        script.onerror = () => reject(new Error("PayPal checkout could not load."));
        document.head.appendChild(script);
      }));
    return paypalSdkPromise;
  }

  async function openCheckout(plan) {
    const dialog = document.querySelector("#checkout-dialog");
    const container = document.querySelector("#paypal-button-container");
    const status = document.querySelector("#checkout-status");
    const isMonth = plan === "30-day";
    document.querySelector("#checkout-title").textContent = isMonth ? "30-Day Pass — C$72" : "7-Day Pass — C$27";
    document.querySelector("#checkout-summary").textContent = "Complete the payment securely with PayPal. Your license will be created and emailed immediately after capture.";
    container.replaceChildren();
    status.textContent = "Loading secure checkout…";
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    try {
      const paypal = await loadPayPalSdk();
      status.textContent = "";
      await paypal.Buttons({
        createOrder: async () => {
          const response = await fetch(`${licenseApiBase}/v1/paypal/orders`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ plan }),
          });
          const result = await response.json();
          if (!response.ok || !result.id) throw new Error(result.message || "Could not create PayPal order.");
          return result.id;
        },
        onApprove: async (data) => {
          status.textContent = "Confirming payment and creating your license…";
          const response = await fetch(`${licenseApiBase}/v1/paypal/orders/${encodeURIComponent(data.orderID)}/capture`, { method: "POST" });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.message || "Payment confirmation failed.");
          status.textContent = `Payment completed. Your license was sent to ${result.email}. Save this token: ${result.token}`;
        },
        onCancel: () => { status.textContent = "Checkout canceled. No payment was completed."; },
        onError: (error) => { status.textContent = error?.message || "PayPal checkout failed. Please try again."; },
      }).render(container);
    } catch (error) {
      status.textContent = error?.message || "Checkout is temporarily unavailable.";
    }
  }

  document.querySelectorAll("[data-payment], [data-chrome-store]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.matches("[data-payment]")) {
        event.preventDefault();
        openCheckout(link.dataset.payment === "month" ? "30-day" : "week");
        return;
      }
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

  document.querySelector("#checkout-dialog .close")?.addEventListener("click", () => document.querySelector("#checkout-dialog")?.close());

  const requestedPlan = new URLSearchParams(location.search).get("plan");
  if (["week", "30-day"].includes(requestedPlan)) openCheckout(requestedPlan);

  const note = document.querySelector("[data-config-note]");
  if (note) {
    note.textContent = "Secure PayPal checkout creates and verifies each payment through the server.";
  }
})();
