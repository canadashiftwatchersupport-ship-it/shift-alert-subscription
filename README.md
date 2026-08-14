# Shift Alert subscription starter

This customer edition detects matching job cards and opens the official Amazon listing. When enabled by the customer, it can navigate intermediate schedule and application-setup controls. It never clicks the final Submit action and never handles identity, selfie, document, eligibility, or other verification steps.

## Plans

- Day Pass: C$10 for 24 hours
- Monthly Pass: C$60, recurring every month

## Parts

- `extension/`: Chrome extension for customers.
- `billing-server/`: Stripe checkout and license-verification starter.

## Before launch

1. Create Stripe Prices for the day pass and monthly subscription.
2. Deploy `billing-server` with HTTPS and a real database.
3. Set `LICENSE_API_BASE` in `extension/config.js` to the deployed server URL.
4. Load `extension/` through `chrome://extensions` during testing, then package it for distribution.

## License email

Add SMTP settings to the billing server environment using `.env.example`. After a successful Stripe checkout, the server creates a token tied to the checkout email and sends it automatically. Customers must enter that same email and token in the extension.

Never put Stripe secret keys in the extension. Do not promise hiring, shift availability, or successful applications.
