# Shift Alert subscription starter

This customer edition detects matching job cards and opens the official Amazon listing. When enabled by the customer, it can navigate intermediate schedule and application-setup controls. It never clicks the final Submit action and never handles identity, selfie, document, eligibility, or other verification steps.

## Plans

- Day Activation: C$15 for 24 hours
- 30-Day Activation: C$75 for 30 days

## Parts

- `extension/`: Chrome extension for customers.
- `billing-server/`: Cloudflare Worker + D1 license server.

## Free deployment path

1. Create a free Cloudflare account.
2. Create a D1 database.
3. Update `wrangler.toml` with your D1 database ID.
4. Apply the schema from `billing-server/migrations/0001_init.sql`.
5. Deploy the Worker with Wrangler from the repo root.
6. Set `LICENSE_API_BASE` in `extension/config.js` to the Worker URL.
7. Load `extension/` through `chrome://extensions` during testing, then package it for distribution.

## License storage

The Worker stores licenses in D1 and verifies them server-side.

## Notes

- Do not place secret keys in the extension.
- Do not promise hiring, shift availability, or successful applications.
