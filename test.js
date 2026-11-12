#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");

// Load the browser-style scripts in Node.
const feesPath = path.join(__dirname, "fees.js");
const csvPath = path.join(__dirname, "csv.js");
global.window = global;
require(feesPath);
require(csvPath);
const Fees = global.TakehomeFees;
const Csv = global.TakehomeCsv;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok  " + name);
}

// Official worked example: $50 Etsy US item, no shipping, no tax, listing allocated, no ads.
// Listing $0.20 + transaction 6.5% * 50 = $3.25 + processing 3% * 50 + $0.25 = $1.75. Total fees $5.20.
// Received $44.80. COGS $15 → profit $29.80. 30% reserve $8.94. Takehome $20.86.
test("$50 Etsy sale matches published fee arithmetic", () => {
  const r = Fees.priceListing({
    platform: "etsyUS",
    itemPrice: 50,
    includeListingFee: true,
    offsiteAds: "none",
    cogs: 15,
    taxReservePercent: 30,
  });
  assert.strictEqual(r.fees.find((f) => f.id === "listing").cents, 20);
  assert.strictEqual(r.fees.find((f) => f.id === "transaction").cents, 325);
  assert.strictEqual(r.fees.find((f) => f.id === "processing").cents, 175);
  assert.strictEqual(r.feeTotalCents, 520);
  assert.strictEqual(r.receivedCents, 4480);
  assert.strictEqual(r.profitCents, 2980);
  assert.strictEqual(r.reserveCents, 894);
  assert.strictEqual(r.takehomeCents, 2086);
  assert.strictEqual(r.formatted.takehome, "$20.86");
});

test("Etsy processing includes sales tax; transaction does not", () => {
  const r = Fees.priceListing({
    platform: "etsyUS",
    itemPrice: 50,
    salesTaxRate: 0.10, // $5 tax
    includeListingFee: false,
    offsiteAds: "none",
  });
  // Transaction: 6.5% of $50 = $3.25
  assert.strictEqual(r.fees.find((f) => f.id === "transaction").cents, 325);
  // Processing: 3% of $55 + $0.25 = $1.65 + $0.25 = $1.90
  assert.strictEqual(r.salesTaxCents, 500);
  assert.strictEqual(r.fees.find((f) => f.id === "processing").cents, 190);
  // Gross to seller excludes tax collected
  assert.strictEqual(r.grossCents, 5000);
});

test("Etsy Offsite Ads 15% capped at $100", () => {
  const small = Fees.priceListing({
    platform: "etsyUS",
    itemPrice: 50,
    includeListingFee: false,
    offsiteAds: "standard",
  });
  assert.strictEqual(small.fees.find((f) => f.id === "offsiteAds").cents, 750);

  const large = Fees.priceListing({
    platform: "etsyUS",
    itemPrice: 900,
    includeListingFee: false,
    offsiteAds: "standard",
  });
  // 15% of $900 = $135, cap $100
  assert.strictEqual(large.fees.find((f) => f.id === "offsiteAds").cents, 10000);
});

test("Stripe 2.9% + $0.30 on a $100 charge", () => {
  const r = Fees.priceListing({ platform: "stripeUS", itemPrice: 100 });
  assert.strictEqual(r.feeTotalCents, 320); // 290 + 30
  assert.strictEqual(r.receivedCents, 9680);
});

test("Gumroad direct is 10% + $0.50 plus 2.9% + $0.30", () => {
  const r = Fees.priceListing({ platform: "gumroadDirect", itemPrice: 20 });
  // Platform: 200 + 50 = 250. Processing: 58 + 30 = 88. Total 338.
  assert.strictEqual(r.fees.find((f) => f.id === "gumroadPlatform").cents, 250);
  assert.strictEqual(r.fees.find((f) => f.id === "gumroadProcessing").cents, 88);
  assert.strictEqual(r.feeTotalCents, 338);
  assert.strictEqual(r.receivedCents, 1662);
});

test("Reverse solver meets the target take-home", () => {
  const base = {
    platform: "etsyUS",
    includeListingFee: true,
    offsiteAds: "none",
    cogs: 15,
    taxReservePercent: 30,
  };
  const solved = Fees.priceForTarget({ ...base, targetTakehome: 20.86 });
  assert.ok(solved.ok);
  assert.ok(solved.result.takehomeCents >= 2086);
  // Should be at or very near the $50 example.
  assert.ok(solved.unitCents >= 5000 && solved.unitCents <= 5050, "unit was " + solved.unitCents);
});

test("CSV parser handles quotes, commas, and CRLF", () => {
  const rows = Csv.parseCsv('A,B\r\n"hello, world",2\n"she said ""hi""",3\n');
  assert.deepStrictEqual(rows[0], ["A", "B"]);
  assert.deepStrictEqual(rows[1], ["hello, world", "2"]);
  assert.deepStrictEqual(rows[2], ['she said "hi"', "3"]);
});

test("Etsy sample auto-maps and excludes bank deposits from take-home", () => {
  const text = fs.readFileSync(path.join(__dirname, "sample-data/etsy-payout-sample.csv"), "utf8");
  const raw = Csv.parseCsv(text);
  const map = Csv.autoMap(raw[0]);
  assert.ok(map.amount >= 0 && map.fees >= 0 && map.net >= 0 && map.type >= 0);
  const mapped = Csv.mapRows(raw, map);
  const deposit = mapped.rows.find((r) => r.type === "Deposit");
  assert.strictEqual(deposit.category, "payout");
  const summary = Fees.summarizePayout(mapped.rows, { extraCosts: 0, taxReservePercent: 30 });
  // Sum of sale amounts: 48+36+48+72+54+18+72+48 = 396
  assert.strictEqual(summary.grossCents, 39600);
  // Refund amount abs net = 32.33
  assert.strictEqual(summary.refundCents, 3233);
  // Deposits must not be subtracted as costs
  assert.strictEqual(summary.payoutCents, -23000);
  // Net from file excludes the deposit row
  const expectedNet =
    4319 + 3233 - 20 + 4319 - 3233 + 6491 - 1080 + 4862 + 1604 - 20 + 6491 + 4319;
  assert.strictEqual(summary.receivedCents, expectedNet);
  assert.ok(summary.takehomeCents > 0);
});

test("Stripe sample categorizes charge, refund, and payout", () => {
  const text = fs.readFileSync(path.join(__dirname, "sample-data/stripe-payout-sample.csv"), "utf8");
  const raw = Csv.parseCsv(text);
  const map = Csv.autoMap(raw[0]);
  const mapped = Csv.mapRows(raw, map);
  const cats = mapped.rows.map((r) => r.category);
  assert.deepStrictEqual(cats, ["sale", "sale", "refund", "sale", "sale", "payout"]);
  const summary = Fees.summarizePayout(mapped.rows, { taxReservePercent: 0 });
  // Nets of charges + refund, excluding payout: 242.45+174.48-40+91.94+310.42 = 779.29
  assert.strictEqual(summary.receivedCents, 77929);
  assert.strictEqual(summary.takehomeCents, 77929);
});

test("Money helper rounds half cents consistently", () => {
  assert.strictEqual(Fees.dollarsToCents("1.005"), 101); // 1.005 * 100 = 100.5 → 101
  assert.strictEqual(Fees.formatMoney(-12345, "USD"), "-$123.45");
});

console.log("\n" + passed + " tests passed");
