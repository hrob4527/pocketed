# Pocketed

See what you actually keep from every sale.

A small browser app that shows online sellers what they actually keep after marketplace fees, their own costs, and a tax reserve they choose.

This is a first version meant to be launched as a $19 one-time product (free listing calculator; paid payout-CSV reader, reverse pricing, and exports). Buy Pro checkout is live at [Lemon Squeezy](https://pcketedapp.lemonsqueezy.com/checkout/buy/44e338e5-789f-4146-938b-cc03b61c46f0). Pro features are not gated in this build — they are unlocked for everyone.

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

- `index.html` — landing page with pricing copy and cited sources
- `app.html` — the working app
- `styles.css`, `fees.js`, `csv.js`, `app.js`
- `sample-data/` — invented example Etsy and Stripe payout CSVs (rows are labeled EXAMPLE)

Fee rates were last checked on 11 November 2026 against the official pages linked on the landing page and in the in-app “Rates & sources” dialog.

Not tax, legal, or accounting advice. Not affiliated with Etsy, Stripe, or Gumroad.
