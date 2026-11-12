(function () {
  const Fees = window.TakehomeFees;
  const Csv = window.TakehomeCsv;
  const STORAGE_KEY = "pocketed.defaults.v1";

  const $ = (id) => document.getElementById(id);

  let payoutState = { rows: [], summary: null, filename: "" };

  function listingInput() {
    return {
      platform: $("platform").value,
      itemPrice: $("itemPrice").value,
      shippingCharged: $("shippingCharged").value,
      giftWrap: $("giftWrap").value,
      quantity: $("quantity").value,
      salesTaxRate: (Number($("salesTaxRate").value) || 0) / 100,
      cogs: $("cogs").value,
      shippingCost: $("shippingCost").value,
      packaging: $("packaging").value,
      labor: $("labor").value,
      taxReservePercent: $("taxReservePercent").value,
      includeListingFee: $("includeListingFee").checked,
      offsiteAds: $("offsiteAds").value,
      customRate: (Number($("customRate").value) || 0) / 100,
      customFixed: $("customFixed").value,
      currency: "USD",
    };
  }

  function togglePlatformOptions() {
    const platform = $("platform").value;
    $("etsy-options").classList.toggle("hidden", platform !== "etsyUS");
    $("custom-options").classList.toggle("hidden", platform !== "custom");
  }

  function renderListing() {
    const result = Fees.priceListing(listingInput());
    const big = $("listing-takehome");
    big.textContent = result.formatted.takehome;
    big.classList.toggle("negative", result.takehomeCents < 0);
    const feePct = (result.effectiveFeeRate * 100).toFixed(1);
    $("listing-caption").textContent =
      result.feeTotalCents || result.costsCents
        ? "Marketplace fees are " + feePct + "% of the sale (excluding sales tax collected)."
        : "Enter a price to see what you pocket.";

    $("listing-kpis").innerHTML = [
      kpi("Gross sale", result.formatted.gross),
      kpi("Marketplace fees", result.formatted.fees),
      kpi("You receive", result.formatted.received),
      kpi("Your costs", result.formatted.costs),
      kpi("Profit", result.formatted.profit),
      kpi("Tax reserve", result.formatted.reserve),
    ].join("");

    const rows = [];
    rows.push(ledgerRow("Item", result.formatted.item));
    if (result.shippingChargedCents) rows.push(ledgerRow("Shipping charged", result.formatted.shippingCharged, true));
    if (result.giftWrapCents) rows.push(ledgerRow("Gift wrap", result.formatted.giftWrap, true));
    if (result.salesTaxCents) rows.push(ledgerRow("Sales tax collected (not yours to keep)", result.formatted.salesTax, true));
    result.fees.forEach((fee) => rows.push(ledgerRow(fee.label, fee.formatted, true)));
    rows.push(ledgerRow("You receive", result.formatted.received));
    result.costLines.forEach((line) => rows.push(ledgerRow(line.label, line.formatted, true)));
    rows.push(ledgerRow("Profit", result.formatted.profit));
    rows.push(ledgerRow("Tax reserve (" + Math.round(result.reserveRate * 100) + "%)", result.formatted.reserve, true));
    rows.push('<tr class="take"><td>Pocketed</td><td>' + escapeHtml(result.formatted.takehome) + "</td></tr>");
    $("listing-ledger").innerHTML = "<tbody>" + rows.join("") + "</tbody>";
  }

  function kpi(label, value) {
    return '<div><span class="k">' + escapeHtml(label) + '</span><span class="v">' + escapeHtml(value) + "</span></div>";
  }
  function ledgerRow(label, value, mute) {
    return "<tr" + (mute ? ' class="mute"' : "") + "><td>" + escapeHtml(label) + "</td><td>" + escapeHtml(value) + "</td></tr>";
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function solveReverse() {
    const status = $("reverse-status");
    const target = $("targetTakehome").value;
    if (target === "" || Number(target) < 0) {
      status.textContent = "Enter the take-home you want on this sale.";
      return;
    }
    const solved = Fees.priceForTarget({ ...listingInput(), targetTakehome: target });
    if (!solved.ok) {
      status.textContent = solved.error;
      return;
    }
    const unit = Fees.centsToDollars(solved.unitCents);
    $("itemPrice").value = unit.toFixed(2);
    renderListing();
    status.textContent = "Set item price to " + solved.unitFormatted + " so take-home is at least " + Fees.formatMoney(Fees.dollarsToCents(target), "USD") + ".";
  }

  function saveDefaults() {
    const data = listingInput();
    data.salesTaxRatePercent = $("salesTaxRate").value;
    data.customRatePercent = $("customRate").value;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      $("reverse-status").textContent = "Defaults saved in this browser only.";
    } catch (err) {
      $("reverse-status").textContent = "Could not save defaults in this browser.";
    }
  }

  function loadDefaults() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const assign = (id, value) => {
        if (value === undefined || value === null || !$(id)) return;
        $(id).value = value;
      };
      assign("platform", data.platform);
      assign("itemPrice", data.itemPrice);
      assign("shippingCharged", data.shippingCharged);
      assign("giftWrap", data.giftWrap);
      assign("quantity", data.quantity);
      assign("salesTaxRate", data.salesTaxRatePercent);
      assign("cogs", data.cogs);
      assign("shippingCost", data.shippingCost);
      assign("packaging", data.packaging);
      assign("labor", data.labor);
      assign("taxReservePercent", data.taxReservePercent);
      assign("offsiteAds", data.offsiteAds);
      assign("customRate", data.customRatePercent);
      assign("customFixed", data.customFixed);
      if (typeof data.includeListingFee === "boolean") $("includeListingFee").checked = data.includeListingFee;
    } catch (err) {
      // Ignore unreadable localStorage.
    }
  }

  function resetListing() {
    $("platform").value = "etsyUS";
    $("itemPrice").value = "50";
    $("shippingCharged").value = "0";
    $("giftWrap").value = "0";
    $("quantity").value = "1";
    $("salesTaxRate").value = "0";
    $("taxReservePercent").value = "30";
    $("cogs").value = "15";
    $("shippingCost").value = "0";
    $("packaging").value = "0";
    $("labor").value = "0";
    $("includeListingFee").checked = true;
    $("offsiteAds").value = "none";
    $("targetTakehome").value = "";
    $("reverse-status").textContent = "";
    togglePlatformOptions();
    renderListing();
  }

  function setMode(mode) {
    const listing = mode === "listing";
    $("mode-listing").classList.toggle("hidden", !listing);
    $("mode-payout").classList.toggle("hidden", listing);
    $("tab-listing").setAttribute("aria-selected", listing ? "true" : "false");
    $("tab-payout").setAttribute("aria-selected", listing ? "false" : "true");
    if (location.hash !== (listing ? "" : "#payout")) {
      history.replaceState(null, "", listing ? "app.html" : "app.html#payout");
    }
  }

  function renderColumnMap(headers, map) {
    const fields = [
      ["date", "Date"],
      ["type", "Type"],
      ["title", "Title / description"],
      ["amount", "Amount (gross)"],
      ["fees", "Fees"],
      ["net", "Net"],
    ];
    const box = $("column-map");
    box.classList.remove("hidden");
    box.innerHTML = fields
      .map(([key, label]) => {
        const opts = ['<option value="-1">(not in file)</option>']
          .concat(
            headers.map((h, i) => {
              const sel = map[key] === i ? " selected" : "";
              return '<option value="' + i + '"' + sel + ">" + escapeHtml(h || "Column " + (i + 1)) + "</option>";
            })
          )
          .join("");
        return (
          '<div class="field"><label for="map-' +
          key +
          '">' +
          label +
          '</label><select id="map-' +
          key +
          '" data-map="' +
          key +
          '">' +
          opts +
          "</select></div>"
        );
      })
      .join("");
    box.querySelectorAll("select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const next = { ...map };
        box.querySelectorAll("select").forEach((s) => {
          next[s.getAttribute("data-map")] = Number(s.value);
        });
        applyMappedRows(payoutState.rawRows, next, payoutState.filename);
      });
    });
  }

  function applyMappedRows(rawRows, map, filename) {
    const mapped = Csv.mapRows(rawRows, map, { currency: "USD" });
    payoutState = {
      rawRows,
      map,
      rows: mapped.rows,
      filename: filename || "payout.csv",
      warnings: mapped.warnings,
      platform: mapped.platform,
      summary: null,
    };
    const warn = $("csv-warnings");
    if (mapped.warnings.length) {
      warn.classList.remove("hidden");
      warn.textContent = mapped.warnings.join(" ");
    } else {
      warn.classList.add("hidden");
      warn.textContent = "";
    }
    renderPayoutTable();
    renderPayoutSummary();
  }

  function renderPayoutTable() {
    const wrap = $("rows-wrap");
    const table = $("rows-table");
    if (!payoutState.rows.length) {
      wrap.classList.add("hidden");
      table.innerHTML = "";
      return;
    }
    wrap.classList.remove("hidden");
    const body = payoutState.rows
      .map((row) => {
        return (
          '<tr class="' +
          escapeHtml(row.category) +
          '"><td>' +
          escapeHtml(row.date) +
          "</td><td>" +
          escapeHtml(row.type) +
          "</td><td>" +
          escapeHtml(row.title) +
          '</td><td class="num">' +
          escapeHtml(row.formattedAmount) +
          '</td><td class="num">' +
          escapeHtml(row.formattedFees) +
          '</td><td class="num">' +
          escapeHtml(row.formattedNet) +
          "</td></tr>"
        );
      })
      .join("");
    table.innerHTML =
      "<thead><tr><th>Date</th><th>Type</th><th>Title</th><th class='num'>Amount</th><th class='num'>Fees</th><th class='num'>Net</th></tr></thead><tbody>" +
      body +
      "</tbody>";
  }

  function renderPayoutSummary() {
    const exportBtn = $("btn-export-csv");
    const printBtn = $("btn-print-payout");
    if (!payoutState.rows.length) {
      $("payout-takehome").textContent = "—";
      $("payout-takehome").classList.remove("negative");
      $("payout-caption").textContent = "Drop a file or load a sample to see totals. Bank deposits are listed separately and are not treated as expenses.";
      $("payout-kpis").innerHTML = "";
      $("payout-ledger").innerHTML = "";
      exportBtn.disabled = true;
      printBtn.disabled = true;
      return;
    }
    const summary = Fees.summarizePayout(payoutState.rows, {
      extraCosts: $("payoutCosts").value,
      taxReservePercent: $("payoutReserve").value,
      currency: "USD",
    });
    payoutState.summary = summary;
    $("payout-takehome").textContent = summary.formatted.takehome;
    $("payout-takehome").classList.toggle("negative", summary.takehomeCents < 0);
    $("payout-caption").textContent =
      payoutState.rows.length +
      " rows from " +
      payoutState.filename +
      (payoutState.platform && payoutState.platform !== "generic" ? " · detected as " + payoutState.platform : "") +
      ".";
    $("payout-kpis").innerHTML = [
      kpi("Gross sales", summary.formatted.gross),
      kpi("Fees in file", summary.formatted.fees),
      kpi("Refunds", summary.formatted.refunds),
      kpi("Net in file", summary.formatted.received),
      kpi("Extra costs you added", summary.formatted.costs),
      kpi("Tax reserve", summary.formatted.reserve),
    ].join("");
    const typeRows = summary.typeRows
      .map((row) => ledgerRow(row.type + " × " + row.count, row.formatted, true))
      .join("");
    const payoutLine = summary.payoutCents
      ? ledgerRow("Transferred to bank (not an expense)", summary.formatted.payouts, true)
      : "";
    $("payout-ledger").innerHTML =
      "<tbody>" +
      ledgerRow("Net after fees & refunds", summary.formatted.received) +
      ledgerRow("Extra costs", summary.formatted.costs, true) +
      ledgerRow("Profit", summary.formatted.profit) +
      ledgerRow("Tax reserve (" + (Number($("payoutReserve").value) || 0) + "%)", summary.formatted.reserve, true) +
      '<tr class="take"><td>Pocketed</td><td>' +
      escapeHtml(summary.formatted.takehome) +
      "</td></tr>" +
      payoutLine +
      typeRows +
      "</tbody>";
    exportBtn.disabled = false;
    printBtn.disabled = false;
  }

  function handleCsvText(text, filename) {
    const rawRows = Csv.parseCsv(text);
    if (!rawRows.length) {
      $("csv-warnings").classList.remove("hidden");
      $("csv-warnings").textContent = "That file had no rows.";
      return;
    }
    const headers = rawRows[0];
    const map = Csv.autoMap(headers);
    renderColumnMap(headers, map);
    applyMappedRows(rawRows, map, filename);
  }

  function loadLocalSample(path, fallbackName) {
    fetch(path)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load " + path);
        return res.text();
      })
      .then((text) => handleCsvText(text, fallbackName))
      .catch(() => {
        $("csv-warnings").classList.remove("hidden");
        $("csv-warnings").textContent = "Could not load the sample file. If you opened this page as a local file, serve the folder over http so the samples can load, or drop the CSV from sample-data/ yourself.";
      });
  }

  function exportSummary() {
    if (!payoutState.summary) return;
    const s = payoutState.summary;
    const lines = [
      ["Field", "Amount"],
      ["File", payoutState.filename],
      ["Rows", String(s.rowCount)],
      ["Gross sales", s.formatted.gross],
      ["Fees in file", s.formatted.fees],
      ["Refunds", s.formatted.refunds],
      ["Net in file", s.formatted.received],
      ["Extra costs", s.formatted.costs],
      ["Profit", s.formatted.profit],
      ["Tax reserve", s.formatted.reserve],
      ["Pocketed", s.formatted.takehome],
      ["Transferred to bank", s.formatted.payouts],
      [],
      ["Type", "Count", "Net"],
    ];
    s.typeRows.forEach((row) => lines.push([row.type, String(row.count), row.formatted]));
    const csv = lines
      .map((cols) => cols.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pocketed-summary.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openSources() {
    const list = $("sources-list");
    const items = [];
    Object.keys(Fees.RATES).forEach((key) => {
      const block = Fees.RATES[key];
      if (!block || !block.sources) return;
      block.sources.forEach((src) => {
        items.push("<li><a href='" + src.url + "' target='_blank' rel='noopener'>" + escapeHtml(src.label) + "</a></li>");
      });
    });
    items.push('<li>Rates dated ' + escapeHtml(Fees.RATES.asOf) + ".</li>");
    list.innerHTML = items.join("");
    $("sources-dialog").showModal();
  }

  function bindListing() {
    const form = $("listing-form");
    form.addEventListener("input", () => {
      togglePlatformOptions();
      renderListing();
    });
    form.addEventListener("change", () => {
      togglePlatformOptions();
      renderListing();
    });
    $("btn-reverse").addEventListener("click", solveReverse);
    $("btn-save-defaults").addEventListener("click", saveDefaults);
    $("btn-reset-listing").addEventListener("click", resetListing);
    $("btn-print-listing").addEventListener("click", () => window.print());
  }

  function bindPayout() {
    const drop = $("drop-zone");
    const file = $("csv-file");
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f);
    });
    file.addEventListener("change", () => {
      if (file.files[0]) readFile(file.files[0]);
    });
    function readFile(f) {
      const reader = new FileReader();
      reader.onload = () => handleCsvText(String(reader.result || ""), f.name);
      reader.readAsText(f);
    }
    $("btn-sample-etsy").addEventListener("click", () => loadLocalSample("sample-data/etsy-payout-sample.csv", "etsy-payout-sample.csv"));
    $("btn-sample-stripe").addEventListener("click", () => loadLocalSample("sample-data/stripe-payout-sample.csv", "stripe-payout-sample.csv"));
    $("payoutCosts").addEventListener("input", renderPayoutSummary);
    $("payoutReserve").addEventListener("input", renderPayoutSummary);
    $("btn-export-csv").addEventListener("click", exportSummary);
    $("btn-print-payout").addEventListener("click", () => window.print());
  }

  function bindChrome() {
    $("tab-listing").addEventListener("click", () => setMode("listing"));
    $("tab-payout").addEventListener("click", () => setMode("payout"));
    $("btn-sources").addEventListener("click", openSources);
    $("btn-close-sources").addEventListener("click", () => $("sources-dialog").close());
    if (location.hash === "#payout") setMode("payout");
  }

  loadDefaults();
  togglePlatformOptions();
  bindListing();
  bindPayout();
  bindChrome();
  renderListing();
})();
