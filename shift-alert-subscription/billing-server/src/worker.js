const textEncoder = new TextEncoder();

const DEFAULT_DAY_AMOUNT = 1500;
const DEFAULT_MONTH_AMOUNT = 7500;
const DEFAULT_DAY_HOURS = 24;
const DEFAULT_MONTH_DAYS = 30;
const PAYPAL_EVENT_TYPES = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.SALE.COMPLETED",
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CREATED",
]);

function hasEmailDeliveryConfig(env) {
  return Boolean(env.RESEND_API_KEY?.trim() && env.EMAIL_FROM?.trim());
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
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

function determinePlanByAmount(amount, dayAmount, monthAmount) {
  if (amount === dayAmount) return "day";
  if (amount === monthAmount) return "30-day";
  return null;
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
  return (env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com").trim().replace(/\/+$/, "");
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
  const planLabel = license.plan === "30-day" ? "30-Day Pass" : "Day Pass";
  const accessLabel = license.plan === "30-day" ? "30 days" : "24 hours";

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
  const dayAmount = safeInt(env.DAY_PASS_AMOUNT_PAISE, DEFAULT_DAY_AMOUNT);
  const monthAmount = safeInt(env.THIRTY_DAY_PASS_AMOUNT_PAISE, DEFAULT_MONTH_AMOUNT);
  const dayHours = safeInt(env.DAY_PASS_HOURS, DEFAULT_DAY_HOURS);
  const monthDays = safeInt(env.THIRTY_DAY_ACCESS_DAYS, DEFAULT_MONTH_DAYS);

  const plan = determinePlanByAmount(amount, dayAmount, monthAmount);
  if (!plan) {
    return json(
      {
        ok: false,
        message: `Unexpected payment amount. Expected ${dayAmount} or ${monthAmount}, got ${amount}.`,
      },
      400,
    );
  }
  const expiresAt = plan === "30-day" ? nowPlusDays(monthDays) : nowPlusHours(dayHours);
  const status = payload?.payment_link?.entity?.status || "paid";
  const license = {
    token: crypto.randomUUID(),
    email: email || "",
    plan,
    amount: amount || (plan === "30-day" ? monthAmount : dayAmount),
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
  const dayAmount = safeInt(env.DAY_PASS_AMOUNT_PAISE, DEFAULT_DAY_AMOUNT);
  const monthAmount = safeInt(env.THIRTY_DAY_PASS_AMOUNT_PAISE, DEFAULT_MONTH_AMOUNT);
  const dayHours = safeInt(env.DAY_PASS_HOURS, DEFAULT_DAY_HOURS);
  const monthDays = safeInt(env.THIRTY_DAY_ACCESS_DAYS, DEFAULT_MONTH_DAYS);

  const plan = determinePlanByAmount(amount, dayAmount, monthAmount);
  if (!plan) {
    return json(
      {
        ok: false,
        message: `Unexpected payment amount. Expected ${dayAmount} or ${monthAmount}, got ${amount}.`,
      },
      400,
    );
  }
  const expiresAt = plan === "30-day" ? nowPlusDays(monthDays) : nowPlusHours(dayHours);
  const paymentLinkId = getPayPalReferenceId(event) || crypto.randomUUID();
  const status = String(getPayPalResource(event)?.status || "COMPLETED").toLowerCase();

  const license = {
    token: crypto.randomUUID(),
    email: email || "",
    plan,
    amount: amount || (plan === "30-day" ? monthAmount : dayAmount),
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

async function seedSchemaOnFirstRequest(env) {
  try {
    await ensureSchema(env);
  } catch {
    // If the DB is newly created and schema init fails once, the next request can retry.
  }
}

export default {
  async fetch(request, env) {
    await seedSchemaOnFirstRequest(env);

    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "GET" && pathname === "/health") {
      return json({ ok: true, service: "billing-worker", provider: "cloudflare-workers" });
    }

    if (request.method === "POST" && pathname === "/v1/paypal/webhook") {
      return handlePayPalWebhook(request, env);
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
