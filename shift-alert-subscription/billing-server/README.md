# Canada Shift Watcher billing worker

This folder contains the Cloudflare Worker + D1 version of the billing server.

## What it does

- receives payment webhook events
- stores licenses in D1
- verifies licenses for the extension
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

## Notes

- Cloudflare Workers is a no-card free deployment path.
- D1 keeps the license data.
- PayPal webhook delivery is verified through PayPal's `verify-webhook-signature` endpoint.
- If you want email delivery later, add a separate email provider integration.
