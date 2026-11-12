/**
 * Pocketed fee engines.
 * Rates last checked 11 Nov 2026 against official pages linked in RATES.
 * Money is handled in integer cents to avoid floating-point drift.
 */
(function (root) {
  const RATES = {
    asOf: "2026-11-11",
    etsyUS: {
      listingFeeCents: 20,
      transactionRate: 0.065,
      processingRate: 0.03,
      processingFixedCents: 25,
      offsiteAdsStandard: 0.15,
      offsiteAdsDiscount: 0.12,
      offsiteAdsCapCents: 10000,
      sources: [
        {
          label: "Etsy — How to sell in the United States",
          url: "https://www.etsy.com/sell",
        },
        {
          label: "Etsy Help — Fees and taxes",
          url: "https://help.etsy.com/hc/en-us/articles/115014483627-What-are-the-Fees-and-Taxes-for-Selling-on-Etsy",
        },
        {
          label: "Etsy Help — Payment processing fees",
          url: "https://help.etsy.com/hc/en-us/articles/115015628847-What-are-Payment-Processing-Fees-for-Selling-on-Etsy",
        },
      ],
    },
    stripeUS: {
      rate: 0.029,
      fixedCents: 30,
      sources: [
        {
          label: "Stripe pricing (domestic cards, United States)",
          url: "https://stripe.com/pricing",
        },
      ],
    },
    gumroadDirect: {
      platformRate: 0.10,
      platformFixedCents: 50,
      processingRate: 0.029,
      processingFixedCents: 30,
      sources: [
        {
          label: "Gumroad Help — Fees",
          url: "https://gumroad.com/help/article/66-gumroads-fees",
        },
      ],
    },
  };

  function dollarsToCents(value) {
    if (value === "" || value === null || value === undefined) return 0;
    const raw = String(value).replace(/[$,\s]/g, "").trim();
    if (!raw) return 0;
    const sign = raw.charAt(0) === "-" ? -1 : 1;
    const unsigned = raw.replace(/^[+-]/, "");
    if (!/^\d*(\.\d*)?$/.test(unsigned) || unsigned === "" || unsigned === ".") {
      const n = Number(raw);
      if (!Number.isFinite(n)) return 0;
      return Math.round(Number((n * 100).toPrecision(12)));
    }
    const parts = unsigned.split(".");
    const whole = parts[0] || "0";
    const frac = parts[1] || "";
    const two = (frac + "00").slice(0, 2);
    let cents = parseInt(whole, 10) * 100 + parseInt(two, 10);
    const third = frac.charAt(2);
    if (third && third >= "5") cents += 1;
    return sign * cents;
  }

  function centsToDollars(cents) {
    return (cents / 100);
  }

  function formatMoney(cents, currency) {
    const sign = cents < 0 ? "-" : "";
    const abs = Math.abs(cents);
    const major = Math.floor(abs / 100);
    const minor = String(abs % 100).padStart(2, "0");
    const symbol = currency === "USD" || !currency ? "$" : currency + " ";
    return sign + symbol + major.toLocaleString("en-US") + "." + minor;
  }

  function percentOfCents(cents, rate) {
    return Math.round(cents * rate);
  }

  function applyReserve(profitCents, reserveRate) {
    if (profitCents <= 0 || !reserveRate) return 0;
    return Math.round(profitCents * reserveRate);
  }

  /**
   * Price one sale and return an itemized take-home breakdown.
   * input amounts are dollars (numbers); output amounts are cents plus formatted strings.
   */
  function priceListing(input) {
    const currency = input.currency || "USD";
    const platform = input.platform || "etsyUS";
    const itemCents = dollarsToCents(input.itemPrice);
    const shippingChargedCents = dollarsToCents(input.shippingCharged);
    const giftWrapCents = dollarsToCents(input.giftWrap);
    const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
    const taxRate = Number(input.salesTaxRate) || 0;
    const cogsCents = dollarsToCents(input.cogs);
    const shippingCostCents = dollarsToCents(input.shippingCost);
    const packagingCents = dollarsToCents(input.packaging);
    const laborCents = dollarsToCents(input.labor);
    const reserveRate = (Number(input.taxReservePercent) || 0) / 100;
    const includeListingFee = Boolean(input.includeListingFee);
    const offsiteAds = input.offsiteAds || "none"; // none | standard | discount
    const customRate = Number(input.customRate) || 0;
    const customFixedCents = dollarsToCents(input.customFixed);

    const merchCents = (itemCents + shippingChargedCents + giftWrapCents) * (platform === "etsyUS" ? 1 : 1);
    // For Etsy, merch (order total excluding sales tax) is item + shipping charged + gift wrap, times quantity on the item.
    // Quantity multiplies the item price; shipping is usually once per order. Keep shipping/gift wrap as order-level.
    const itemTotalCents = itemCents * qty;
    const orderExTaxCents = itemTotalCents + shippingChargedCents + giftWrapCents;
    const salesTaxCents = Math.round(orderExTaxCents * taxRate);

    const fees = [];
    let feeTotalCents = 0;

    function addFee(id, label, cents, note) {
      const c = Math.round(cents);
      fees.push({ id, label, cents: c, formatted: formatMoney(c, currency), note: note || "" });
      feeTotalCents += c;
    }

    if (platform === "etsyUS") {
      const r = RATES.etsyUS;
      if (includeListingFee) {
        // $0.20 to list, plus $0.20 per extra quantity sold (auto-renew sold).
        const listingCents = r.listingFeeCents * qty;
        addFee(
          "listing",
          qty > 1 ? "Listing / auto-renew sold" : "Listing fee",
          listingCents,
          "$0.20 per listing, and $0.20 per extra quantity sold."
        );
      }
      addFee(
        "transaction",
        "Transaction fee (6.5%)",
        percentOfCents(orderExTaxCents, r.transactionRate),
        "6.5% of item price, shipping you charge, and gift wrap. Not sales tax."
      );
      const processingBase = orderExTaxCents + salesTaxCents;
      addFee(
        "processing",
        "Payment processing (3% + $0.25)",
        percentOfCents(processingBase, r.processingRate) + r.processingFixedCents,
        "Charged on item, shipping, and sales tax collected."
      );
      if (offsiteAds === "standard" || offsiteAds === "discount") {
        const rate = offsiteAds === "discount" ? r.offsiteAdsDiscount : r.offsiteAdsStandard;
        const raw = percentOfCents(orderExTaxCents, rate);
        const ads = Math.min(raw, r.offsiteAdsCapCents);
        addFee(
          "offsiteAds",
          offsiteAds === "discount" ? "Offsite Ads (12%)" : "Offsite Ads (15%)",
          ads,
          "On the order total, capped at $100 per order. 12% if the shop made at least $10,000 in the past 365 days."
        );
      }
    } else if (platform === "stripeUS") {
      const r = RATES.stripeUS;
      // Standard domestic card: 2.9% + 30¢ on the charge amount (item + shipping; tax if you collect it on the charge).
      const chargeCents = orderExTaxCents + salesTaxCents;
      addFee(
        "stripe",
        "Stripe processing (2.9% + $0.30)",
        percentOfCents(chargeCents, r.rate) + r.fixedCents,
        "United States standard pricing for domestic cards. International and currency-conversion fees are not included."
      );
    } else if (platform === "gumroadDirect") {
      const r = RATES.gumroadDirect;
      const chargeCents = orderExTaxCents + salesTaxCents;
      addFee(
        "gumroadPlatform",
        "Gumroad fee (10% + $0.50)",
        percentOfCents(chargeCents, r.platformRate) + r.platformFixedCents,
        "Direct sales on your Gumroad profile, not Discover marketplace sales (those are a flat 30%, including processing)."
      );
      addFee(
        "gumroadProcessing",
        "Card processing (2.9% + $0.30)",
        percentOfCents(chargeCents, r.processingRate) + r.processingFixedCents,
        "Credit card processing, charged on top of Gumroad's fee. PayPal checkout fees are separate and not included here."
      );
    } else if (platform === "custom") {
      const chargeCents = orderExTaxCents + salesTaxCents;
      addFee(
        "custom",
        "Custom platform fee",
        percentOfCents(chargeCents, customRate) + customFixedCents,
        "Your own percentage plus fixed fee, applied to the total charge."
      );
    } else {
      throw new Error("Unknown platform: " + platform);
    }

    const costsCents = cogsCents * qty + shippingCostCents + packagingCents + laborCents;
    // Sales tax collected is not yours to keep; it also is not "fees". Gross to the seller is the order excluding tax.
    const grossCents = orderExTaxCents;
    const receivedCents = grossCents - feeTotalCents;
    const profitCents = receivedCents - costsCents;
    const reserveCents = applyReserve(profitCents, reserveRate);
    const takehomeCents = profitCents - reserveCents;
    const effectiveFeeRate = grossCents > 0 ? feeTotalCents / grossCents : 0;

    const costLines = [
      { id: "cogs", label: qty > 1 ? "Cost of goods (×" + qty + ")" : "Cost of goods", cents: cogsCents * qty },
      { id: "shippingCost", label: "Shipping you pay", cents: shippingCostCents },
      { id: "packaging", label: "Packaging", cents: packagingCents },
      { id: "labor", label: "Labor / time", cents: laborCents },
    ]
      .filter((line) => line.cents !== 0)
      .map((line) => ({ ...line, formatted: formatMoney(line.cents, currency) }));

    return {
      platform,
      currency,
      quantity: qty,
      itemCents: itemTotalCents,
      shippingChargedCents,
      giftWrapCents,
      salesTaxCents,
      grossCents,
      fees,
      feeTotalCents,
      costsCents,
      costLines,
      receivedCents,
      profitCents,
      reserveCents,
      reserveRate,
      takehomeCents,
      effectiveFeeRate,
      formatted: {
        item: formatMoney(itemTotalCents, currency),
        shippingCharged: formatMoney(shippingChargedCents, currency),
        giftWrap: formatMoney(giftWrapCents, currency),
        salesTax: formatMoney(salesTaxCents, currency),
        gross: formatMoney(grossCents, currency),
        fees: formatMoney(feeTotalCents, currency),
        costs: formatMoney(costsCents, currency),
        received: formatMoney(receivedCents, currency),
        profit: formatMoney(profitCents, currency),
        reserve: formatMoney(reserveCents, currency),
        takehome: formatMoney(takehomeCents, currency),
      },
    };
  }

  /**
   * Solve for the item unit price that yields a target take-home.
   * Shipping charged, gift wrap, costs, tax rate, and ads are treated as given.
   */
  function priceForTarget(input) {
    const targetCents = dollarsToCents(input.targetTakehome);
    const reserveRate = (Number(input.taxReservePercent) || 0) / 100;
    const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
    const shippingChargedCents = dollarsToCents(input.shippingCharged);
    const giftWrapCents = dollarsToCents(input.giftWrap);
    const platform = input.platform || "etsyUS";

    if (targetCents < 0) {
      return { ok: false, error: "Target take-home can’t be negative." };
    }
    if (reserveRate >= 1) {
      return { ok: false, error: "Tax reserve must be less than 100%." };
    }

    // Binary search on unit item price. Fees are monotonic in price.
    let lo = 0;
    let hi = Math.max(targetCents * 8 + 100000, 100000); // $1,000 floor range, expands if needed
    let found = null;

    function trial(unitCents) {
      const result = priceListing({ ...input, itemPrice: centsToDollars(unitCents) });
      return result;
    }

    // Expand upper bound until take-home meets or exceeds the target, or give up.
    for (let i = 0; i < 12; i++) {
      const top = trial(hi);
      if (top.takehomeCents >= targetCents) break;
      hi *= 2;
      if (hi > 100000000) break; // $1,000,000 unit price
    }
    const top = trial(hi);
    if (top.takehomeCents < targetCents) {
      return { ok: false, error: "Could not reach that take-home with the current costs and fees." };
    }

    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const result = trial(mid);
      if (result.takehomeCents >= targetCents) {
        found = result;
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    const result = found || trial(lo);
    // The search solves for unit price in cents; report unit and line total.
    const unitCents = Math.round(result.itemCents / qty);
    return {
      ok: true,
      unitCents,
      unitFormatted: formatMoney(unitCents, input.currency || "USD"),
      result,
    };
  }

  /**
   * Totals for a parsed payout statement, after optional extra costs and a tax reserve.
   */
  function summarizePayout(rows, options) {
    const currency = (options && options.currency) || "USD";
    const extraCostsCents = dollarsToCents(options && options.extraCosts);
    const reserveRate = ((options && Number(options.taxReservePercent)) || 0) / 100;

    let grossCents = 0;
    let feeCents = 0;
    let refundCents = 0;
    let netFromFileCents = 0;
    let payoutCents = 0;
    let otherCents = 0;
    const byType = {};

    rows.forEach((row) => {
      const cat = row.category || "other";
      const net = row.netCents || 0;
      const amount = row.amountCents || 0;
      const fees = row.feeCents || 0;
      if (!byType[row.type || cat]) {
        byType[row.type || cat] = { count: 0, netCents: 0 };
      }
      byType[row.type || cat].count += 1;
      byType[row.type || cat].netCents += net;

      if (cat === "sale") {
        grossCents += amount;
        feeCents += Math.abs(fees);
        netFromFileCents += net;
      } else if (cat === "refund") {
        refundCents += Math.abs(net !== 0 ? net : amount);
        feeCents += Math.abs(fees);
        netFromFileCents += net;
      } else if (cat === "fee") {
        feeCents += Math.abs(net !== 0 ? net : fees || amount);
        netFromFileCents += net;
      } else if (cat === "payout") {
        payoutCents += net !== 0 ? net : amount;
      } else {
        otherCents += net;
        netFromFileCents += net;
      }
    });

    const receivedCents = netFromFileCents; // already net of marketplace fees and refunds in-file
    const profitCents = receivedCents - extraCostsCents;
    const reserveCents = applyReserve(profitCents, reserveRate);
    const takehomeCents = profitCents - reserveCents;

    const typeRows = Object.keys(byType)
      .sort()
      .map((type) => ({
        type,
        count: byType[type].count,
        netCents: byType[type].netCents,
        formatted: formatMoney(byType[type].netCents, currency),
      }));

    return {
      rowCount: rows.length,
      grossCents,
      feeCents,
      refundCents,
      payoutCents,
      otherCents,
      receivedCents,
      extraCostsCents,
      profitCents,
      reserveCents,
      takehomeCents,
      typeRows,
      formatted: {
        gross: formatMoney(grossCents, currency),
        fees: formatMoney(feeCents, currency),
        refunds: formatMoney(refundCents, currency),
        payouts: formatMoney(payoutCents, currency),
        received: formatMoney(receivedCents, currency),
        costs: formatMoney(extraCostsCents, currency),
        profit: formatMoney(profitCents, currency),
        reserve: formatMoney(reserveCents, currency),
        takehome: formatMoney(takehomeCents, currency),
      },
    };
  }

  const api = {
    RATES,
    dollarsToCents,
    centsToDollars,
    formatMoney,
    priceListing,
    priceForTarget,
    summarizePayout,
  };

  root.TakehomeFees = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
