# Pocketed

See what you actually keep from every sale.

A small browser app that shows online sellers what they actually keep after marketplace fees, their own costs, and a tax reserve they choose.

This is a first version meant to be launched as a $19 one-time product (free listing calculator; paid payout-CSV reader, reverse pricing, and exports). Buy Pro checkout is live at [Lemon Squeezy](https://pcketedapp.lemonsqueezy.com/checkout/buy/44e338e5-789f-4146-938b-cc03b61c46f0). Pro is unlocked with a Lemon Squeezy license key (see below).

## Free vs Pro

- **Free:** single-listing calculator for every platform, itemized fees, tax reserve, print the listing report, the sample CSVs, and **one** of your own payout CSVs per browser.
- **Pro ($19 once):** unlimited own payout CSVs, reverse pricing (solve for item price), summary CSV export, payout report printing, saved shop defaults.

## License keys

`license.js` calls Lemon Squeezy's public [License API](https://docs.lemonsqueezy.com/api/license-api) straight from the browser (CORS is open, no secret key):

- **Enter license key** → `POST /v1/licenses/activate` (`license_key`, `instance_name`). The response's `meta.store_id` must be `521551` (store `pcketedapp`) and `meta.product_id` must be `1519948` (Pocketed Pro), else the key is rejected and the activation is released.
- Key + instance id are stored in `localStorage` (`pocketed.license.v1`). Each page load re-checks with `POST /v1/licenses/validate` (`license_key`, `instance_id`).
- If Lemon Squeezy can't be reached (network error, 5xx, 429), a key validated in the last 14 days keeps working offline. A definite "invalid/disabled/expired/wrong product" answer removes it.
- **Remove key** → `POST /v1/licenses/deactivate` and clears local storage.

The product must have **license keys enabled** in the Lemon Squeezy dashboard (Products → Pocketed Pro → "Generate license keys"). As with any static site, gating is client-side and can be bypassed by someone editing the page; it is meant to keep honest buyers honest.

## Run it locally

From this folder:

```bash
python3 -m http.server 8765
```

Then open http://127.0.0.1:8765/ for the landing page or http://127.0.0.1:8765/app.html for the app.

Open the files directly (`file://`) and the calculator still works. The packaged sample CSVs need the local server (or you can drop the files from `sample-data/` yourself).

## Tests

```bash
node test.js
```

## What’s in the box

- `index.html` — bright storefront home: fee calculator pitch, shop search, category chips, most-wanted products, pricing and cited sources
- `app.html` — the working app
- `styles.css`, `fees.js`, `csv.js`, `license.js`, `app.js`
- `sample-data/` — invented example Etsy and Stripe payout CSVs (rows are labeled EXAMPLE)

Fee rates were last checked on 11 November 2026 against the official pages linked on the landing page and in the in-app “Rates & sources” dialog.

Not tax, legal, or accounting advice. Not affiliated with Etsy, Stripe, or Gumroad.

## Shop

`shop.html` is the storefront catalog (`shop/catalog.json`, covers in `shop/covers/`). Search, category chips (Spreadsheets, Printables/PDFs, Templates, Bundles), price filters and a research-based Most wanted row are all client-side. Each product has a `checkout_url`; a Lemon Squeezy link shows a Buy button (lemon.js overlay). An empty `checkout_url` shows "Coming soon".
