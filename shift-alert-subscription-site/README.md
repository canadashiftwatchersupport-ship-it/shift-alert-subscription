# Canada Shift Watcher website

This folder contains the public website for Canada Shift Watcher, an independent Chrome extension that can be downloaded for free and then activated with a paid license. It monitors matching listings, helps customers notice relevant opportunities faster, and keeps final review and submission manual.

## Public pages

- `index.html`
- `faq.html`
- `privacy.html`
- `terms.html`
- `refund.html`
- `contact.html`

## Pricing shown on the site

- Day Activation: C$15 for 24-hour access, one-time payment
- 30-Day Activation: C$75 for 30-day access, one-time payment

## Config values to edit

Open `config.js` and replace:

- `dayPassPaymentUrl` with your Day Pass hosted checkout link
- `monthPassPaymentUrl` with your 30-Day Pass hosted checkout link
- `chromeWebStoreUrl` with your Chrome Web Store listing URL
- `supportEmail` with your support email address

If a URL is not available yet, the site shows a clear Coming soon state instead of a broken link.

Do not place payment processor secret keys, webhook secrets, or database credentials in any frontend file.

## What to publish

Upload these files together:

- `index.html`
- `faq.html`
- `privacy.html`
- `terms.html`
- `refund.html`
- `contact.html`
- `styles.css`
- `app.js`
- `config.js`
- `favicon.svg`
- `Canada-Shift-Watcher-paid-v1.4.1-new.zip`

## Before sending for payment review

1. Confirm every navigation and footer link opens correctly.
2. Confirm both prices show C$15 and C$75, not USD.
3. Confirm payment buttons are not hard-coded to fake URLs.
4. Confirm privacy, terms, refund, and contact pages are publicly reachable.
5. Confirm the site language does not promise hiring, shifts, or successful applications.
6. Confirm the browser frontend contains no secret keys.
7. Publish the site and use the live public URL in your payment provider review submission.

