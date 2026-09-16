# Canada Shift Watcher website

This folder contains the public website for Canada Shift Watcher, an independent Chrome extension that can be downloaded for free and then activated with a paid license. It monitors matching listings, helps customers notice relevant opportunities faster, and keeps final review and submission manual.

## Public pages

- `index.html`
- `guides.html`
- `installation-guide.html`
- `settings-guide.html`
- `troubleshooting-guide.html`
- `faq.html`
- `privacy.html`
- `terms.html`
- `refund.html`
- `contact.html`

## Pricing shown on the site

- Weekly Activation: C$36 for 7-day access, one-time payment
- 30-Day Activation: C$54 for 30-day access, one-time payment

## Checkout and config

The website creates PayPal orders through the licence Worker. Prices are configured server-side and must match the public prices shown here.

Open `config.js` to maintain:

- `chromeWebStoreUrl` with your Chrome Web Store listing URL
- `supportEmail` with your support email address

If a URL is not available yet, the site shows a clear Coming soon state instead of a broken link.

Do not place payment processor secret keys, webhook secrets, or database credentials in any frontend file.

## What to publish

Upload these files together:

- `index.html`
- `guides.html`
- `installation-guide.html`
- `settings-guide.html`
- `troubleshooting-guide.html`
- `faq.html`
- `privacy.html`
- `terms.html`
- `refund.html`
- `contact.html`
- `styles.css`
- `app.js`
- `config.js`
- `favicon.svg`
- `robots.txt`
- `sitemap.xml`
- `downloads/canada-shift-watcher-extension.zip`

## Google AdSense preparation

The site includes original installation, configuration, and troubleshooting guides; a privacy disclosure for Google advertising cookies; `robots.txt`; and `sitemap.xml`. Do not add a fake publisher ID. After AdSense supplies the real `ca-pub-...` ID, add Google’s verification snippet to each page and publish `ads.txt` with that same publisher ID. Configure an approved consent message for visitors in regions where consent is required.

Keep ads on informational pages and away from payment, download, navigation, and other interactive controls. Never place AdSense inside the extension or automatically refresh a page containing ads.

## Before sending for payment review

1. Confirm every navigation and footer link opens correctly.
2. Confirm both prices show C$36 and C$54, not USD.
3. Confirm payment buttons are not hard-coded to fake URLs.
4. Confirm privacy, terms, refund, and contact pages are publicly reachable.
5. Confirm the site language does not promise hiring, shifts, or successful applications.
6. Confirm the browser frontend contains no secret keys.
7. Publish the site and use the live public URL in your payment provider review submission.

