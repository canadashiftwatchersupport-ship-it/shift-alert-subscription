# Shift Alert subscription starter — free Cloudflare deploy checklist

Use this folder for the no-card deployment path:

- `outputs/shift-alert-subscription`

What gets deployed:

- `billing-server/src/worker.js`
  - Cloudflare Worker web service
- `billing-server/migrations/0001_init.sql`
  - D1 database schema

Cloudflare setup:

1. Create a free Cloudflare account.
2. Create a D1 database named `canada-shift-watcher-db`.
3. Copy the D1 database ID into `wrangler.toml`.
4. Run `npm install` in the repo root.
5. Apply migrations with `npm run d1:apply`.
6. Deploy with `npm run deploy`.
7. Copy the Worker URL.
8. Set `LICENSE_API_BASE` in `extension/config.js` to that Worker URL.

Important:

- This path avoids the Render card prompt.
- The Worker stores licenses in D1.
- Email delivery is included in the Worker when `RESEND_API_KEY` and `EMAIL_FROM` are configured.
