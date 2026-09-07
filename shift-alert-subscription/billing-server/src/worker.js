const textEncoder = new TextEncoder();

const DEFAULT_WEEK_AMOUNT = 2700;
const DEFAULT_MONTH_AMOUNT = 7200;
const DEFAULT_WEEK_HOURS = 168;
const DEFAULT_MONTH_DAYS = 30;
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, X-Manual-License-Secret",
};
const PAYPAL_EVENT_TYPES = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.SALE.COMPLETED",
  "CHECKOUT.ORDER.APPROVED",
  "CHECKOUT.ORDER.COMPLETED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CREATED",
]);

function hasEmailDeliveryConfig(env) {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS_HEADERS, ...headers },
  });
}

function nowPlusHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function nowPlusDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  return JSON.parse(text);
}

function getEmailFromPayload(payload) {
  return (
    payload?.payment?.entity?.email ||
    payload?.payment?.entity?.contact ||
    payload?.payment_link?.entity?.customer?.email ||
    payload?.payment_link?.entity?.customer?.contact ||
    payload?.customer?.email ||
    payload?.customer?.contact ||
    ""
  );
}

function getPaymentAmount(payload) {
  return Number(
    payload?.payment?.entity?.amount ||
      payload?.payment_link?.entity?.amount ||
      payload?.payment_link?.entity?.total_amount ||
      0,
  );
}

function getPaymentLinkId(payload) {
  return (
    payload?.payment_link?.entity?.id ||
    payload?.payment_link?.entity?.reference_id ||
    payload?.payment?.entity?.notes?.payment_link_id ||
    payload?.payment?.entity?.order_id ||
    ""
  );
}

function toMinorUnits(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed * 100);
}

function getPayPalResource(event) {
  return event?.resource || event?.payload?.resource || {};
}

function getPayPalEmail(event) {
  const resource = getPayPalResource(event);
  return (
    resource?.payer?.email_address ||
    resource?.payer?.payer_info?.email ||
    resource?.purchase_units?.[0]?.payee?.email_address ||
    resource?.purchase_units?.[0]?.shipping?.email_address ||
    resource?.subscriber?.email_address ||
    resource?.shipping_detail?.recipient_name ||
    resource?.email_address ||
    resource?.custom_id ||
    ""
  );
}

function getPayPalAmount(event) {
  const resource = getPayPalResource(event);
  const amount =
    resource?.amount?.value ||
    resource?.purchase_units?.[0]?.amount?.value ||
    resource?.seller_receivable_breakdown?.gross_amount?.value ||
    resource?.payments?.captures?.[0]?.amount?.value ||
    resource?.billing_info?.last_payment?.amount?.value ||
    0;
  return toMinorUnits(amount, 0);
}

function getPayPalReferenceId(event) {
  const resource = getPayPalResource(event);
  return (
    resource?.supplementary_data?.related_ids?.order_id ||
    resource?.supplementary_data?.related_ids?.capture_id ||
    resource?.purchase_units?.[0]?.reference_id ||
    resource?.purchase_units?.[0]?.custom_id ||
    resource?.id ||
    resource?.billing_agreement_id ||
    event?.id ||
    ""
  );
}

function getPayPalEventType(event) {
  return String(event?.event_type || event?.event || "").trim();
}

function safeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function determinePlanByAmount(amount, weekAmount, monthAmount) {
  if (amount === weekAmount) return "week";
  if (amount === monthAmount) return "30-day";
  return null;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isAuthorizedManualIssue(request, env) {
  const secret = env.MANUAL_LICENSE_SECRET?.trim();
  if (!secret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  // Prefer the dedicated header so a stale collection-level Authorization
  // header in Postman cannot override the operator's manual secret.
  const provided = request.headers.get("x-manual-license-secret")?.trim() || bearer || "";
  return Boolean(provided) && timingSafeEqual(provided, secret);
}

async function hmacSha256Hex(secret, rawBody) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, rawBody);
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyGenericWebhook(request, env, rawBody) {
  const sharedSecret = env.WEBHOOK_SECRET?.trim();
  if (!sharedSecret) return true;

  const providedSecret = request.headers.get("x-webhook-secret")?.trim();
  if (providedSecret && timingSafeEqual(providedSecret, sharedSecret)) return true;

  const providedSignature =
    request.headers.get("x-webhook-signature") ||
    request.headers.get("x-paypal-transmission-sig") ||
    request.headers.get("x-paypal-signature") ||
    "";
  if (!providedSignature) return false;

  const expected = await hmacSha256Hex(sharedSecret, rawBody);
  return timingSafeEqual(providedSignature, expected);
}

function paypalApiBase(env) {
  return (env.PAYPAL_API_BASE || "https://api-m.paypal.com").trim().replace(/\/+$/, "");
}

async function getPayPalAccessToken(env) {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET.");
  }

  const response = await fetch(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get PayPal access token: ${response.status} ${text}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error("PayPal access token response did not include an access_token.");
  }
  return String(data.access_token);
}

async function verifyPayPalManualPayment(env, resourceType, resourceId) {
  const type = String(resourceType || "capture").toLowerCase();
  const id = String(resourceId || "").trim();
  if (!id || !["capture", "order"].includes(type)) {
    throw new Error("resourceType must be capture or order, and resourceId is required.");
  }

  const token = await getPayPalAccessToken(env);
  const path = type === "capture" ? `/v2/payments/captures/${encodeURIComponent(id)}` : `/v2/checkout/orders/${encodeURIComponent(id)}`;
  const response = await fetch(`${paypalApiBase(env)}${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal payment lookup failed: ${response.status} ${text}`);
  }
  const resource = await response.json();
  const status = String(resource?.status || "").toUpperCase();
  if (status !== "COMPLETED") throw new Error(`PayPal payment is not completed (status: ${status || "unknown"}).`);

  const amount = type === "capture"
    ? resource?.amount
    : resource?.purchase_units?.[0]?.amount;
  const currency = String(amount?.currency_code || "").toUpperCase();
  const value = toMinorUnits(amount?.value, 0);
  if (currency !== "CAD" || !value) throw new Error("PayPal payment must be a completed CAD payment.");
  return { amount: value, currency, status, resource };
}

async function verifyPayPalWebhook(request, env, event) {
  const webhookId = env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) {
    throw new Error("Missing PAYPAL_WEBHOOK_ID.");
  }

  const authAlgo = request.headers.get("paypal-auth-algo") || request.headers.get("PAYPAL-AUTH-ALGO");
  const certUrl = request.headers.get("paypal-cert-url") || request.headers.get("PAYPAL-CERT-URL");
  const transmissionId =
    request.headers.get("paypal-transmission-id") || request.headers.get("PAYPAL-TRANSMISSION-ID");
  const transmissionSig =
    request.headers.get("paypal-transmission-sig") || request.headers.get("PAYPAL-TRANSMISSION-SIG");
  const transmissionTime =
    request.headers.get("paypal-transmission-time") || request.headers.get("PAYPAL-TRANSMISSION-TIME");

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return false;
  }

  const accessToken = await getPayPalAccessToken(env);
  const response = await fetch(`${paypalApiBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  return data?.verification_status === "SUCCESS";
}

async function ensureSchema(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS licenses (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      plan TEXT NOT NULL,
      amount INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL,
      payment_link_id TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS seen_events (
      event_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

async function upsertLicense(env, license) {
  const existing = await env.DB.prepare(`
    SELECT token, email
    FROM licenses
    WHERE payment_link_id = ?1
    LIMIT 1
  `).bind(license.paymentLinkId).first();

  const token = existing?.token || license.token;
  const email = license.email || existing?.email || "";

  await env.DB.prepare(`
    INSERT INTO licenses (token, email, plan, amount, active, status, payment_link_id, expires_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7, datetime('now'))
    ON CONFLICT(payment_link_id) DO UPDATE SET
      token = excluded.token,
      email = excluded.email,
      plan = excluded.plan,
      amount = excluded.amount,
      active = 1,
      status = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = datetime('now')
  `).bind(
    token,
    email,
    license.plan,
    license.amount,
    license.status,
    license.paymentLinkId,
    license.expiresAt,
  ).run();
}

function buildLicenseEmail(license) {
  const planLabel = license.plan === "30-day" ? "30-Day Pass" : license.plan === "week" ? "7-Day Pass" : "Day Pass";
  const accessLabel = license.plan === "30-day" ? "30 days" : license.plan === "week" ? "7 days" : "24 hours";

  return {
    subject: `Your Canada Shift Watcher ${planLabel} license`,
    text: [
      `Thanks for your purchase.`,
      ``,
      `Your license details:`,
      `Email: ${license.email}`,
      `License token: ${license.token}`,
      `Plan: ${planLabel}`,
      `Access period: ${accessLabel}`,
      `Expires at: ${license.expiresAt}`,
      ``,
      `Activate your extension by opening the Canada Shift Watcher popup, entering the same email address and license token, then clicking Activate.`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <h2 style="margin: 0 0 12px;">Your Canada Shift Watcher ${planLabel} license</h2>
        <p>Thanks for your purchase.</p>
        <p><strong>Email:</strong> ${license.email}</p>
        <p><strong>License token:</strong> <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${license.token}</code></p>
        <p><strong>Plan:</strong> ${planLabel}</p>
        <p><strong>Access period:</strong> ${accessLabel}</p>
        <p><strong>Expires at:</strong> ${license.expiresAt}</p>
        <p>Open the Canada Shift Watcher extension, enter the same email address and license token, then click <strong>Activate</strong>.</p>
      </div>
    `,
  };
}

async function sendLicenseEmail(env, license) {
  if (!license.email || !license.token) {
    return { sent: false, reason: "missing-email-or-token" };
  }

  if (!hasEmailDeliveryConfig(env)) {
    return { sent: false, reason: "missing-email-config" };
  }

  const { subject, text, html } = buildLicenseEmail(license);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM.trim(),
      to: [license.email],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to send license email: ${response.status} ${errorText}`);
  }

  return { sent: true };
}

async function markEventSeen(env, eventId) {
  if (!eventId) return false;
  const result = await env.DB.prepare(`
    INSERT INTO seen_events (event_id)
    VALUES (?1)
    ON CONFLICT(event_id) DO NOTHING
  `).bind(eventId).run();
  return result.meta?.changes === 0;
}

async function buildLicenseResponse(env, email, token) {
  const row = await env.DB.prepare(`
    SELECT token, email, plan, amount, active, status, payment_link_id, expires_at, updated_at
    FROM licenses
    WHERE token = ?1 AND email = ?2 AND active = 1 AND expires_at > datetime('now')
    LIMIT 1
  `).bind(token, email).first();

  if (!row) {
    return json({ active: false, message: "License is invalid or expired." }, 401);
  }

  return json({
    token: row.token,
    email: row.email,
    plan: row.plan,
    amount: row.amount,
    active: Boolean(row.active),
    status: row.status,
    paymentLinkId: row.payment_link_id,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  });
}

async function handleGenericWebhook(request, env) {
  const rawBody = await request.arrayBuffer();
  const bodyBytes = new Uint8Array(rawBody);

  if (!(await verifyGenericWebhook(request, env, bodyBytes))) {
    return json({ ok: false, message: "Invalid webhook signature." }, 400);
  }

  let event;
  try {
    event = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return json({ ok: false, message: "Invalid JSON payload." }, 400);
  }

  if (event?.id && (await markEventSeen(env, event.id))) {
    return json({ ok: true, duplicate: true });
  }

  if (event?.event !== "payment_link.paid") {
    return json({ ok: true, ignored: true });
  }

  const payload = event?.payload || {};
  const paymentLinkId = getPaymentLinkId(payload) || crypto.randomUUID();
  const amount = getPaymentAmount(payload);
  const email = getEmailFromPayload(payload);
  const weekAmount = safeInt(env.WEEK_PASS_AMOUNT_PAISE, DEFAULT_WEEK_AMOUNT);
  const monthAmount = safeInt(env.THIRTY_DAY_PASS_AMOUNT_PAISE, DEFAULT_MONTH_AMOUNT);
  const weekHours = safeInt(env.WEEK_PASS_HOURS, DEFAULT_WEEK_HOURS);
  const monthDays = safeInt(env.THIRTY_DAY_ACCESS_DAYS, DEFAULT_MONTH_DAYS);

  const plan = determinePlanByAmount(amount, weekAmount, monthAmount);
  if (!plan) {
    return json(
      {
        ok: false,
        message: `Unexpected payment amount. Expected ${weekAmount} or ${monthAmount}, got ${amount}.`,
      },
      400,
    );
  }
  const expiresAt = plan === "30-day" ? nowPlusDays(monthDays) : nowPlusHours(weekHours);
  const status = payload?.payment_link?.entity?.status || "paid";
  const license = {
    token: crypto.randomUUID(),
    email: email || "",
    plan,
    amount: amount || (plan === "30-day" ? monthAmount : weekAmount),
    status,
    paymentLinkId,
    expiresAt,
  };

  await upsertLicense(env, license);
  const emailResult = await sendLicenseEmail(env, license).catch((error) => ({
    sent: false,
    reason: "send-failed",
    error: error instanceof Error ? error.message : String(error),
  }));

  return json({
    ok: true,
    plan: license.plan,
    token: license.token,
    expiresAt: license.expiresAt,
    emailSent: emailResult.sent,
    emailStatus: emailResult,
  });
}

async function handlePayPalWebhook(request, env) {
  const rawBody = await request.arrayBuffer();
  const bodyText = new TextDecoder().decode(rawBody);

  let event;
  try {
    event = JSON.parse(bodyText);
  } catch {
    return json({ ok: false, message: "Invalid JSON payload." }, 400);
  }

  const verified = await verifyPayPalWebhook(request, env, event).catch(() => false);
  if (!verified) {
    return json({ ok: false, message: "Invalid PayPal webhook signature." }, 400);
  }

  if (event?.id && (await markEventSeen(env, event.id))) {
    return json({ ok: true, duplicate: true });
  }

  const eventType = getPayPalEventType(event);
  if (!PAYPAL_EVENT_TYPES.has(eventType)) {
    return json({ ok: true, ignored: true, eventType });
  }

  const amount = getPayPalAmount(event);
  if (!amount) {
    return json({ ok: false, message: "Could not determine payment amount from PayPal event." }, 400);
  }

  const email = getPayPalEmail(event);
  const weekAmount = safeInt(env.WEEK_PASS_AMOUNT_PAISE, DEFAULT_WEEK_AMOUNT);
  const monthAmount = safeInt(env.THIRTY_DAY_PASS_AMOUNT_PAISE, DEFAULT_MONTH_AMOUNT);
  const weekHours = safeInt(env.WEEK_PASS_HOURS, DEFAULT_WEEK_HOURS);
  const monthDays = safeInt(env.THIRTY_DAY_ACCESS_DAYS, DEFAULT_MONTH_DAYS);

  const plan = determinePlanByAmount(amount, weekAmount, monthAmount);
  if (!plan) {
    return json(
      {
        ok: false,
        message: `Unexpected payment amount. Expected ${weekAmount} or ${monthAmount}, got ${amount}.`,
      },
      400,
    );
  }
  const expiresAt = plan === "30-day" ? nowPlusDays(monthDays) : nowPlusHours(weekHours);
  const paymentLinkId = getPayPalReferenceId(event) || crypto.randomUUID();
  const status = String(getPayPalResource(event)?.status || "COMPLETED").toLowerCase();

  const license = {
    token: crypto.randomUUID(),
    email: email || "",
    plan,
    amount: amount || (plan === "30-day" ? monthAmount : weekAmount),
    status,
    paymentLinkId,
    expiresAt,
  };

  await upsertLicense(env, license);
  const emailResult = await sendLicenseEmail(env, license).catch((error) => ({
    sent: false,
    reason: "send-failed",
    error: error instanceof Error ? error.message : String(error),
  }));

  return json({
    ok: true,
    provider: "paypal",
    eventType,
    plan: license.plan,
    token: license.token,
    expiresAt: license.expiresAt,
    emailSent: emailResult.sent,
    emailStatus: emailResult,
  });
}

async function handleManualLicenseIssue(request, env) {
  if (!isAuthorizedManualIssue(request, env)) {
    return json({ ok: false, message: "Unauthorized." }, 401);
  }

  let body;
  try {
    body = await readJson(request);
  } catch {
    return json({ ok: false, message: "Invalid JSON payload." }, 400);
  }

  const email = String(body.email || "").trim().toLowerCase();
  const resourceType = String(body.resourceType || "capture").trim().toLowerCase();
  const resourceId = String(body.resourceId || "").trim();
  if (!isValidEmail(email) || !resourceId) {
    return json({ ok: false, message: "A valid email and PayPal resourceId are required." }, 400);
  }

  let payment;
  try {
    payment = await verifyPayPalManualPayment(env, resourceType, resourceId);
  } catch (error) {
    return json({ ok: false, message: error instanceof Error ? error.message : String(error) }, 400);
  }

  const weekAmount = safeInt(env.WEEK_PASS_AMOUNT_PAISE, DEFAULT_WEEK_AMOUNT);
  const monthAmount = safeInt(env.THIRTY_DAY_PASS_AMOUNT_PAISE, DEFAULT_MONTH_AMOUNT);
  const weekHours = safeInt(env.WEEK_PASS_HOURS, DEFAULT_WEEK_HOURS);
  const monthDays = safeInt(env.THIRTY_DAY_ACCESS_DAYS, DEFAULT_MONTH_DAYS);
  const plan = determinePlanByAmount(payment.amount, weekAmount, monthAmount);
  if (!plan) {
    return json({ ok: false, message: `Unexpected payment amount. Expected ${weekAmount} or ${monthAmount}, got ${payment.amount}.` }, 400);
  }

  const paymentLinkId = `manual:${resourceType}:${resourceId}`;
  const existing = await env.DB.prepare("SELECT token, email, plan, expires_at FROM licenses WHERE payment_link_id = ?1 LIMIT 1").bind(paymentLinkId).first();
  if (existing) {
    return json({ ok: true, alreadyIssued: true, token: existing.token, email: existing.email, plan: existing.plan, expiresAt: existing.expires_at });
  }

  const license = {
    token: crypto.randomUUID(),
    email,
    plan,
    amount: payment.amount,
    status: "manual-verified",
    paymentLinkId,
    expiresAt: plan === "30-day" ? nowPlusDays(monthDays) : nowPlusHours(weekHours),
  };
  await upsertLicense(env, license);
  const emailResult = await sendLicenseEmail(env, license).catch((error) => ({ sent: false, reason: "send-failed", error: error instanceof Error ? error.message : String(error) }));
  return json({ ok: true, manuallyIssued: true, plan, token: license.token, expiresAt: license.expiresAt, emailSent: emailResult.sent, emailStatus: emailResult });
}

async function seedSchemaOnFirstRequest(env) {
  try {
    await ensureSchema(env);
  } catch {
    // If the DB is newly created and schema init fails once, the next request can retry.
  }
}


async function checkAmazonBinding(request, env) {
  const body = await readJson(request);
  const email = String(body.email || "").trim();
  const token = String(body.token || "");
  const accountHash = String(body.accountHash || "");
  if (!/^[a-f0-9]{64}$/.test(accountHash)) return json({ ok: false, message: "Amazon account could not be verified." }, 400);
  const auth = await buildLicenseResponse(env, email, token);
  if (!auth.ok) return auth;
  const license = await auth.json();
  if (!license.expiresAt || Date.parse(license.expiresAt) <= Date.now()) return json({ ok: false, message: "License expired." }, 401);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS license_amazon_accounts (license_token TEXT PRIMARY KEY, account_hash TEXT NOT NULL, bound_at TEXT NOT NULL DEFAULT (datetime('now')))").run();
  if (body.bind === true) {
    await env.DB.prepare("INSERT INTO license_amazon_accounts (license_token, account_hash) VALUES (?1, ?2) ON CONFLICT(license_token) DO NOTHING").bind(token, accountHash).run();
  }
  const bound = await env.DB.prepare("SELECT account_hash FROM license_amazon_accounts WHERE license_token = ?1").bind(token).first();
  if (!bound) return json({ ok: false, message: "Bind your Amazon account in the extension before watching." }, 409);
  if (bound.account_hash !== accountHash) return json({ ok: false, message: "This license belongs to a different Amazon account." }, 403);
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    await seedSchemaOnFirstRequest(env);

    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/health") {
      return json({
        ok: true,
        service: "billing-worker",
        provider: "cloudflare-workers",
        manualSecretConfigured: Boolean(env.MANUAL_LICENSE_SECRET),
      });
    }

    if (request.method === "POST" && pathname === "/v1/paypal/webhook") {
      return handlePayPalWebhook(request, env);
    }

    if (request.method === "POST" && pathname === "/v1/admin/licenses/manual") {
      return handleManualLicenseIssue(request, env);
    }

    if (request.method === "POST" && pathname === "/v1/razorpay/webhook") {
      return handleGenericWebhook(request, env);
    }

    if (request.method === "POST" && pathname === "/v1/paypal/callback") {
      return json({
        ok: true,
        message: "Callback received. Final activation should still happen from the webhook.",
      });
    }

    if (request.method === "POST" && pathname === "/v1/razorpay/callback") {
      return json({
        ok: true,
        message: "Callback received. Final activation should still happen from the webhook.",
      });
    }

    if (request.method === "POST" && pathname === "/v1/licenses/amazon-account") {
      try { return await checkAmazonBinding(request, env); }
      catch { return json({ ok: false, message: "Account verification unavailable. Try again later." }, 503); }
    }

    if (request.method === "POST" && pathname === "/v1/licenses/verify") {
      let body = {};
      try {
        body = await readJson(request);
      } catch {
        return json({ active: false, message: "Invalid JSON payload." }, 400);
      }

      const email = String(body.email || "");
      const token = String(body.token || "");
      return buildLicenseResponse(env, email, token);
    }

    return json({ ok: false, message: "Not found." }, 404);
  },
};
