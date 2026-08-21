# Canada Shift Watcher billing worker

This folder contains the Cloudflare Worker + D1 version of the billing server.

## What it does

- receives payment webhook events
- stores licenses in D1
- verifies licenses for the extension
- sends the license token by email when email delivery is configured
- keeps final review and submit steps manual

## Files

- `src/worker.js` — Worker entrypoint
- `wrangler.toml` — Cloudflare Worker config
- `migrations/0001_init.sql` — D1 schema

## Free deployment path

1. Create a free Cloudflare account.
2. Create a D1 database.
3. Copy the D1 database ID into `wrangler.toml`.
4. Run D1 migrations.
5. Deploy the Worker.

## Commands

- `npm install`
- `npm run d1:apply`
- `npm run deploy`

## Environment values

Set these in `wrangler.toml` under `[vars]` or with Wrangler secrets/vars:

- `DAY_PASS_AMOUNT_PAISE`
- `THIRTY_DAY_PASS_AMOUNT_PAISE`
- `DAY_PASS_HOURS`
- `THIRTY_DAY_ACCESS_DAYS`
- `WEBHOOK_SECRET` — optional shared secret for local testing or custom webhook callers
- `PAYPAL_CLIENT_ID` — required for official PayPal webhook verification
- `PAYPAL_CLIENT_SECRET` — required for official PayPal webhook verification
- `PAYPAL_WEBHOOK_ID` — the webhook ID from PayPal Developer Dashboard
- `PAYPAL_API_BASE` — use `https://api-m.sandbox.paypal.com` for sandbox or `https://api-m.paypal.com` for live
- `RESEND_API_KEY` — required to email the license token after payment
- `EMAIL_FROM` — the verified sender address used for license emails
- `MANUAL_LICENSE_SECRET` — required secret for the protected manual-license fallback

## Manual license fallback

If a live PayPal payment is completed but PayPal does not deliver a webhook, an operator can issue the license after confirming the transaction in PayPal Activity. The Worker verifies the transaction directly with PayPal before creating a token, so this endpoint cannot be used to invent licenses.

Set `MANUAL_LICENSE_SECRET` as a Cloudflare Worker secret (never commit it to GitHub):

```powershell
npx wrangler secret put MANUAL_LICENSE_SECRET
```

Then call `POST /v1/admin/licenses/manual` with a bearer token and the customer's email. Use the PayPal **capture ID** when available:

```json
{
  "email": "customer@example.com",
  "resourceType": "capture",
  "resourceId": "47C64933264717119"
}
```

For an order ID, set `resourceType` to `order`. The Worker accepts only completed CAD payments matching the configured C$15 day pass or C$75 30-day pass, stores the license idempotently, and sends the token email when Resend is configured. Repeating the same request returns the existing token instead of issuing a duplicate.

## Notes

- Cloudflare Workers is a no-card free deployment path.
- D1 keeps the license data.
- PayPal webhook delivery is verified through PayPal's `verify-webhook-signature` endpoint.
- Email delivery is enabled when you provide `RESEND_API_KEY` and `EMAIL_FROM`.
