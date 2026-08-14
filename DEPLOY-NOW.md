# Shift Alert subscription starter — deploy checklist

Use this folder for your Render Blueprint:

- `outputs/shift-alert-subscription/render.yaml`

What gets deployed:

- `outputs/shift-alert-subscription/billing-server`
  - Node web service
  - Postgres-backed license storage
- `outputs/shift-alert-subscription/extension`
  - Chrome extension files

Render setup:

1. Create a new Blueprint instance.
2. Connect the repository containing this folder.
3. Let Render read `render.yaml`.
4. Render should create:
   - `canada-shift-watcher-billing` web service
   - `canada-shift-watcher-db` Postgres database
5. Add these environment variables to the web service:
   - `PAYPAL_WEBHOOK_SECRET`
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASSWORD`
   - `LICENSE_FROM`
   - `DAY_PASS_AMOUNT_PAISE=1500`
   - `THIRTY_DAY_PASS_AMOUNT_PAISE=7500`
   - `DAY_PASS_HOURS=24`
   - `THIRTY_DAY_ACCESS_DAYS=30`
   - `PUBLIC_APP_URL`

After deploy:

- Use the Render service URL for PayPal webhook:
  - `https://YOUR-SERVICE.onrender.com/v1/paypal/webhook`
- Update the extension config:
  - `outputs/shift-alert-subscription/extension/config.js`
  - set `licenseApiBase` to the same Render service URL

Important:

- Do not use placeholder URLs in production.
- Keep secret keys and webhook secrets only in Render env vars.
- The server now uses Postgres, so licenses survive restarts.
