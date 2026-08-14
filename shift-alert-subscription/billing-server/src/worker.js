const textEncoder = new TextEncoder();

const DEFAULT_DAY_AMOUNT = 1500;
const DEFAULT_MONTH_AMOUNT = 7500;
const DEFAULT_DAY_HOURS = 24;
const DEFAULT_MONTH_DAYS = 30;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

async function sendActivationEmail(env, license) {
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    throw new Error("Email configuration is missing.");
  }

  if (!license.email) {
    throw new Error("Customer email is missing.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [license.email],
      subject: "Your Canada Shift Watcher activation license",
      html: `
        <h2>Canada Shift Watcher</h2>

        <p>Thank you for your payment.</p>

        <p>Your activation license is:</p>

        <p>
          <strong style="font-size:20px;">
            ${license.token}
          </strong>
        </p>

        <p>
          <strong>Plan:</strong> ${license.plan}<br>
          <strong>Expires:</strong> ${license.expiresAt}
        </p>

        <p>
          Use this license together with the email address used for your payment.
        </p>

        <p>Thank you,<br>Canada Shift Watcher</p>
      `,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Email sending failed: ${errorText}`);
  }

  return response.json();
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

function safeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

async function verifyWebhook(request, env, rawBody) {
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

async function verifyPayPalWebhook(request, env, event) {
  const clientId = env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = env.PAYPAL_WEBHOOK_ID?.trim();

  if (!clientId || !clientSecret || !webhookId) {
    return false;
  }

  const transmissionId =
    request.headers.get("PAYPAL-TRANSMISSION-ID") || "";
  const transmissionTime =
    request.headers.get("PAYPAL-TRANSMISSION-TIME") || "";
  const certUrl =
    request.headers.get("PAYPAL-CERT-URL") || "";
  const authAlgo =
    request.headers.get("PAYPAL-AUTH-ALGO") || "";
  const transmissionSig =
    request.headers.get("PAYPAL-TRANSMISSION-SIG") || "";

  if (
    !transmissionId ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo ||
    !transmissionSig
  ) {
    return false;
  }

  const baseUrl =
    env.PAYPAL_API_BASE_URL?.trim() ||
    "https://api-m.sandbox.paypal.com";

  const credentials = btoa(`${clientId}:${clientSecret}`);

  const tokenResponse = await fetch(
    `${baseUrl}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  if (!tokenResponse.ok) {
    return false;
  }

  const tokenData = await tokenResponse.json();

  if (!tokenData?.access_token) {
    return false;
  }

  const verifyResponse = await fetch(
    `${baseUrl}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
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
    }
  );

  if (!verifyResponse.ok) {
    return false;
  }

  const result = await verifyResponse.json();

  return result?.verification_status === "SUCCESS";
}

async function handlePayPalWebhook(request, env) {
  const rawBody = await request.text();

  let event;

  try {
    event = JSON.parse(rawBody);
  } catch {
    return json(
      { ok: false, message: "Invalid JSON payload." },
      400
    );
  }

  if (!(await verifyPayPalWebhook(request, env, event))) {
    return json(
      { ok: false, message: "Invalid PayPal webhook signature." },
      400
    );
  }

  if (event?.id && (await markEventSeen(env, event.id))) {
    return json({ ok: true, duplicate: true });
  }

  /*
   * We only activate access after PayPal confirms
   * that the payment capture completed.
   */
  if (event?.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
    return json({ ok: true, ignored: true });
  }

  const resource = event?.resource || {};

  const amountValue = Number(
    resource?.amount?.value || 0
  );

  const currency =
    resource?.amount?.currency_code || "";

  const email =
    resource?.payer?.email_address ||
    resource?.payee?.email_address ||
    "";

  const paymentId =
    resource?.id ||
    crypto.randomUUID();

  /*
   * PayPal amounts are decimal currency values.
   * Your existing configuration uses paise.
   */
  const amountPaise = Math.round(amountValue * 100);

  const dayAmount = safeInt(
    env.DAY_PASS_AMOUNT_PAISE,
    DEFAULT_DAY_AMOUNT
  );

  const monthAmount = safeInt(
    env.THIRTY_DAY_PASS_AMOUNT_PAISE,
    DEFAULT_MONTH_AMOUNT
  );

  const dayHours = safeInt(
    env.DAY_PASS_HOURS,
    DEFAULT_DAY_HOURS
  );

  const monthDays = safeInt(
    env.THIRTY_DAY_ACCESS_DAYS,
    DEFAULT_MONTH_DAYS
  );

  const plan =
    amountPaise >= monthAmount
      ? "30-day"
      : "day";

  const expiresAt =
    plan === "30-day"
      ? nowPlusDays(monthDays)
      : nowPlusHours(dayHours);

  const license = {
    token: crypto.randomUUID(),
    email,
    plan,
    amount: amountPaise,
    status: "paid",
    paymentLinkId: `paypal_${paymentId}`,
    expiresAt,
  };

  await upsertLicense(env, license);

  await sendActivationEmail(env, license);

  return json({
    ok: true,
    provider: "paypal",
    plan: license.plan,
    token: license.token,
    expiresAt: license.expiresAt,
    currency,
  });
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

async function handleWebhook(request, env) {
  const rawBody = await request.arrayBuffer();
  const bodyBytes = new Uint8Array(rawBody);

  if (!(await verifyWebhook(request, env, bodyBytes))) {
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

  const plan = amount >= monthAmount ? "30-day" : "day";
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

  return json({
    ok: true,
    plan: license.plan,
    token: license.token,
    expiresAt: license.expiresAt,
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
      return handleWebhook(request, env);
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
