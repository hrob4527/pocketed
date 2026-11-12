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


// ---- License gating (mocked fetch, storage, clock) ----
require(path.join(__dirname, "license.js"));
const License = global.PocketedLicense;
const C = License.CONFIG;

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const goodMeta = { store_id: C.STORE_ID, product_id: C.PRODUCT_ID, product_name: "Pocketed Pro" };
function mockFetch(handler) {
  const calls = [];
  const f = (url, init) => {
    const params = Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ url, init, params });
    const out = handler(url, params, calls.length);
    if (out instanceof Error) return Promise.reject(out);
    return Promise.resolve({ status: out.status || 200, json: () => Promise.resolve(out.body) });
  };
  f.calls = calls;
  return f;
}
const KEY = "38b1460a-5104-4067-a91d-77b872934d51";
const DAY = 24 * 60 * 60 * 1000;

const asyncTests = [];
function atest(name, fn) {
  asyncTests.push([name, fn]);
}

atest("activate stores key + instance and unlocks Pro", async () => {
  const storage = memStorage();
  const fetch = mockFetch(() => ({ body: { activated: true, error: null, instance: { id: "inst-1" }, meta: goodMeta } }));
  assert.strictEqual(License.isPro({ storage }), false);
  const r = await License.activate("  " + KEY + " ", { fetch, storage, now: () => 1000 });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(fetch.calls[0].url, "https://api.lemonsqueezy.com/v1/licenses/activate");
  assert.strictEqual(fetch.calls[0].init.method, "POST");
  assert.strictEqual(fetch.calls[0].init.headers.Accept, "application/json");
  assert.strictEqual(fetch.calls[0].init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.strictEqual(fetch.calls[0].params.license_key, KEY);
  assert.ok(fetch.calls[0].params.instance_name);
  const st = License.readState(storage);
  assert.strictEqual(st.key, KEY);
  assert.strictEqual(st.instanceId, "inst-1");
  assert.strictEqual(License.isPro({ storage, now: () => 2000 }), true);
});

atest("activate rejects a key from another store or product and frees the slot", async () => {
  for (const meta of [
    { store_id: 999, product_id: C.PRODUCT_ID, product_name: "Pocketed Pro" },
    { store_id: C.STORE_ID, product_id: 42, product_name: "Other" },
  ]) {
    const storage = memStorage();
    const fetch = mockFetch((url) =>
      url.endsWith("/activate")
        ? { body: { activated: true, instance: { id: "inst-x" }, meta } }
        : { body: { deactivated: true } }
    );
    const r = await License.activate(KEY, { fetch, storage });
    assert.strictEqual(r.ok, false);
    assert.match(r.error, /different product/);
    assert.strictEqual(License.readState(storage), null);
    assert.strictEqual(License.isPro({ storage }), false);
    assert.ok(fetch.calls.some((c) => c.url.endsWith("/deactivate") && c.params.instance_id === "inst-x"));
  }
});

atest("activate surfaces API errors and network failures without unlocking", async () => {
  const storage = memStorage();
  let r = await License.activate(KEY, {
    storage,
    fetch: mockFetch(() => ({ status: 400, body: { activated: false, error: "This license key has reached the activation limit.", meta: goodMeta } })),
  });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /activation limit/);
  r = await License.activate(KEY, { storage, fetch: mockFetch(() => new TypeError("Failed to fetch")) });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /Couldn’t reach/);
  r = await License.activate("", { storage, fetch: mockFetch(() => ({ body: {} })) });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(License.isPro({ storage }), false);
});

async function activated(now) {
  const storage = memStorage();
  await License.activate(KEY, {
    storage,
    now: () => now,
    fetch: mockFetch(() => ({ body: { activated: true, instance: { id: "inst-1" }, meta: goodMeta } })),
  });
  return storage;
}

atest("validate on later load sends key + instance id and refreshes the timestamp", async () => {
  const storage = await activated(0);
  const fetch = mockFetch(() => ({ body: { valid: true, license_key: { status: "active" }, instance: { id: "inst-1" }, meta: goodMeta } }));
  const r = await License.validateStored({ storage, fetch, now: () => 10 * DAY });
  assert.deepStrictEqual(r, { pro: true, reason: "valid" });
  assert.strictEqual(fetch.calls[0].url, "https://api.lemonsqueezy.com/v1/licenses/validate");
  assert.deepStrictEqual(fetch.calls[0].params, { license_key: KEY, instance_id: "inst-1" });
  assert.strictEqual(License.readState(storage).validatedAt, 10 * DAY);
  // Fresh timestamp extends the offline window.
  assert.strictEqual(License.isPro({ storage, now: () => 20 * DAY }), true);
});

atest("validate removes a key Lemon Squeezy says is invalid, disabled, or for another product", async () => {
  const bad = [
    { status: 404, body: { valid: false, error: "license_key not found." } },
    { body: { valid: true, license_key: { status: "disabled" }, instance: { id: "inst-1" }, meta: goodMeta } },
    { body: { valid: true, license_key: { status: "active" }, instance: { id: "inst-1" }, meta: { ...goodMeta, store_id: 1 } } },
    { body: { valid: true, license_key: { status: "active" }, instance: { id: "other" }, meta: goodMeta } },
  ];
  for (const resp of bad) {
    const storage = await activated(0);
    const r = await License.validateStored({ storage, fetch: mockFetch(() => resp), now: () => DAY });
    assert.strictEqual(r.pro, false);
    assert.strictEqual(License.readState(storage), null);
    assert.strictEqual(License.isPro({ storage, now: () => DAY }), false);
  }
});

atest("offline: a validated key keeps working through the grace period, then locks", async () => {
  const storage = await activated(0);
  const offline = mockFetch(() => new TypeError("Failed to fetch"));
  let r = await License.validateStored({ storage, fetch: offline, now: () => 13 * DAY });
  assert.deepStrictEqual(r, { pro: true, offline: true, reason: "grace" });
  assert.ok(License.readState(storage), "key kept while offline");
  // 5xx / rate limits count as offline too, not as a bad key.
  r = await License.validateStored({ storage, fetch: mockFetch(() => ({ status: 503, body: {} })), now: () => 13 * DAY });
  assert.strictEqual(r.pro, true);
  r = await License.validateStored({ storage, fetch: mockFetch(() => ({ status: 429, body: {} })), now: () => 13 * DAY });
  assert.strictEqual(r.pro, true);
  r = await License.validateStored({ storage, fetch: offline, now: () => 15 * DAY });
  assert.strictEqual(r.pro, false);
  assert.strictEqual(r.offline, true);
  assert.ok(License.readState(storage), "key not deleted, so it re-validates once back online");
});

atest("remove key clears storage and deactivates the instance", async () => {
  const storage = await activated(0);
  const fetch = mockFetch(() => ({ body: { deactivated: true } }));
  const r = await License.deactivate({ storage, fetch });
  assert.strictEqual(r.remote, true);
  assert.strictEqual(fetch.calls[0].url, "https://api.lemonsqueezy.com/v1/licenses/deactivate");
  assert.deepStrictEqual(fetch.calls[0].params, { license_key: KEY, instance_id: "inst-1" });
  assert.strictEqual(License.readState(storage), null);
  assert.strictEqual(License.isPro({ storage, now: () => 1 }), false);
  // Works offline too (local removal still happens).
  const s2 = await activated(0);
  const r2 = await License.deactivate({ storage: s2, fetch: mockFetch(() => new Error("offline")) });
  assert.strictEqual(r2.remote, false);
  assert.strictEqual(License.readState(s2), null);
});

atest("free tier allows one own CSV import; Pro is unlimited", async () => {
  const storage = memStorage();
  assert.strictEqual(License.canImportOwnCsv({ storage }), true);
  License.recordOwnCsvImport({ storage });
  assert.strictEqual(License.canImportOwnCsv({ storage }), false);
  const pro = await activated(Date.now());
  License.recordOwnCsvImport({ storage: pro });
  License.recordOwnCsvImport({ storage: pro });
  assert.strictEqual(License.canImportOwnCsv({ storage: pro }), true);
});

atest("tampered or garbage storage does not unlock Pro", async () => {
  const storage = memStorage();
  storage.setItem(C.STORAGE_KEY, "{not json");
  assert.strictEqual(License.isPro({ storage }), false);
  storage.setItem(C.STORAGE_KEY, JSON.stringify({ key: KEY }));
  assert.strictEqual(License.isPro({ storage }), false);
});

(async () => {
  for (const [name, fn] of asyncTests) {
    await fn();
    passed += 1;
    console.log("ok  " + name);
  }
  console.log("\n" + passed + " tests passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
