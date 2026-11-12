/**
 * Client-side CSV parsing and column mapping for payout statements.
 * Nothing is uploaded; this runs entirely in the browser.
 */
(function (root) {
  const Fees = root.TakehomeFees;

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    const src = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          field += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        // ignore; handle CRLF via the following \n
      } else {
        field += ch;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((r) => r.some((cell) => String(cell).trim() !== ""));
  }

  function normalizeHeader(name) {
    return String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[_/]+/g, " ")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9% ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const HEADER_ALIASES = {
    date: ["date", "created", "created utc", "created at", "time", "transaction date", "posted date"],
    type: ["type", "transaction type", "reporting category", "category", "kind", "activity"],
    title: ["title", "description", "name", "item", "info", "details", "summary", "product"],
    info: ["info", "order id", "order", "id", "transaction id", "charge id"],
    currency: ["currency", "currency code", "currencycode"],
    amount: [
      "amount",
      "gross",
      "gross amount",
      "sale",
      "sales",
      "subtotal",
      "price",
      "total",
      "amount usd",
    ],
    fees: [
      "fees",
      "fee",
      "fees and taxes",
      "fees taxes",
      "stripe fee",
      "gumroad fee",
      "processing fee",
      "transaction fee",
    ],
    net: ["net", "net amount", "net total", "you received", "payout", "proceeds"],
  };

  function autoMap(headers) {
    const normalized = headers.map(normalizeHeader);
    const map = { date: -1, type: -1, title: -1, info: -1, currency: -1, amount: -1, fees: -1, net: -1 };
    Object.keys(HEADER_ALIASES).forEach((field) => {
      const aliases = HEADER_ALIASES[field];
      let found = -1;
      for (let i = 0; i < normalized.length; i++) {
        if (aliases.includes(normalized[i])) {
          found = i;
          break;
        }
      }
      // Loose contains match if exact alias missed.
      if (found === -1) {
        for (let i = 0; i < normalized.length; i++) {
          if (aliases.some((a) => normalized[i] === a || normalized[i].endsWith(" " + a))) {
            found = i;
            break;
          }
        }
      }
      map[field] = found;
    });
    return map;
  }

  function detectPlatform(headers, firstRows) {
    const blob = headers.map(normalizeHeader).join(" | ");
    if (blob.includes("fees and taxes") || (blob.includes("title") && blob.includes("info") && blob.includes("net"))) {
      return "etsy";
    }
    if (blob.includes("stripe fee") || blob.includes("reporting category")) return "stripe";
    if (blob.includes("gumroad")) return "gumroad";
    const types = (firstRows || [])
      .map((r) => String(r).toLowerCase())
      .join(" ");
    if (types.includes("listing fee") || types.includes("offsite ads") || types.includes("payment processing")) {
      return "etsy";
    }
    return "generic";
  }

  function categorize(type, amountCents, netCents) {
    const t = String(type || "").toLowerCase();
    if (/payout|deposit|withdrawal|transfer to bank|bank transfer/.test(t)) return "payout";
    if (/refund|chargeback|dispute|reversal/.test(t)) return "refund";
    if (
      /fee|listing|transaction fee|processing|offsite|advertis|ads|subscription|etsy plus|vat on|regulatory/.test(
        t
      )
    ) {
      return "fee";
    }
    if (/sale|order|payment|charge|item|transaction/.test(t)) return "sale";
    // Fall back to the sign of the row.
    const basis = netCents !== 0 ? netCents : amountCents;
    if (basis < 0) return "fee";
    if (basis > 0) return "sale";
    return "other";
  }

  /**
   * Convert a parsed table into normalized payout rows.
   * Fee columns may be signed (Etsy often stores Fees & Taxes as negatives) or positive deductions.
   */
  function mapRows(rawRows, map, options) {
    if (!rawRows.length) return { headers: [], rows: [], warnings: ["The file was empty."] };
    const headers = rawRows[0];
    const warnings = [];
    const mapped = [];

    if (map.amount < 0 && map.net < 0) {
      warnings.push("Could not find an Amount or Net column. Map the columns and try again.");
    }

    for (let i = 1; i < rawRows.length; i++) {
      const cells = rawRows[i];
      const get = (idx) => (idx >= 0 && cells[idx] != null ? String(cells[idx]).trim() : "");
      const amountRaw = get(map.amount);
      const feeRaw = get(map.fees);
      const netRaw = get(map.net);
      const amountCents = amountRaw === "" ? 0 : Fees.dollarsToCents(amountRaw);
      let feeCents = feeRaw === "" ? 0 : Fees.dollarsToCents(feeRaw);
      let netCents = netRaw === "" ? 0 : Fees.dollarsToCents(netRaw);

      // Infer net / fee when only some columns exist.
      if (netRaw === "" && amountRaw !== "" && feeRaw !== "") {
        // If fees look like a deduction stored as a positive number, net = amount - fees.
        // If fees are already signed, net = amount + fees (fees negative).
        if (feeCents > 0 && amountCents >= feeCents) {
          netCents = amountCents - feeCents;
        } else {
          netCents = amountCents + feeCents;
          feeCents = Math.abs(feeCents);
        }
      } else if (netRaw !== "" && amountRaw !== "" && feeRaw === "") {
        feeCents = amountCents - netCents;
      } else if (feeRaw !== "") {
        // Normalize displayed fee to a positive deduction when it was signed.
        if (feeCents < 0) feeCents = Math.abs(feeCents);
      } else if (netRaw === "" && amountRaw !== "") {
        netCents = amountCents;
      }

      const type = get(map.type) || "Unknown";
      const category = categorize(type, amountCents, netCents);
      mapped.push({
        line: i,
        date: get(map.date),
        type,
        category,
        title: get(map.title) || get(map.info),
        info: get(map.info),
        currency: get(map.currency) || (options && options.currency) || "USD",
        amountCents,
        feeCents,
        netCents,
        formattedAmount: Fees.formatMoney(amountCents, "USD"),
        formattedFees: Fees.formatMoney(feeCents, "USD"),
        formattedNet: Fees.formatMoney(netCents, "USD"),
      });
    }

    return {
      headers,
      rows: mapped,
      warnings,
      platform: detectPlatform(headers, mapped.slice(0, 8).map((r) => r.type + " " + r.title)),
    };
  }

  const api = { parseCsv, normalizeHeader, autoMap, detectPlatform, categorize, mapRows };

  root.TakehomeCsv = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
