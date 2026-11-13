(function () {
  "use strict";
  var FEATURED = [
    "bookkeeping-starter-kit",
    "profit-per-item-calculator",
    "inventory-tracker",
    "tax-set-aside-planner",
    "reseller-flip-log",
    "product-pricing-worksheet",
    "money-and-tax-bundle",
    "seller-spreadsheet-mega-bundle"
  ];
  var KINDS = ["Spreadsheets", "Printables/PDFs", "Templates", "Bundles"];
  var ORIGIN = "https://hrob4527.github.io/pocketed/";

  var grid = document.getElementById("shop-grid");
  var featuredGrid = document.getElementById("featured-grid");
  var wantedSection = document.getElementById("most-wanted");
  var search = document.getElementById("shop-search");
  var searchForm = document.getElementById("shop-search-form");
  var filters = document.getElementById("shop-filters");
  var formatSel = document.getElementById("shop-format");
  var priceSel = document.getElementById("shop-price");
  var sortSel = document.getElementById("shop-sort");
  var count = document.getElementById("shop-count");
  var products = [];
  var state = { kind: "", q: "", format: "", price: "", sort: "featured" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function isUrl(u) { return typeof u === "string" && /^https:\/\/[^\s]+$/.test(u.trim()); }
  function money(n) { return "$" + Number(n).toFixed(n % 1 ? 2 : 0); }
  function kindOf(p) {
    if (p.category === "Bundles" || (p.format && p.format.indexOf("Bundle") === 0)) return "Bundles";
    if (p.format && p.format.indexOf("Spreadsheet") === 0) return "Spreadsheets";
    if (p.format && p.format.indexOf("PDF") !== -1) return "Printables/PDFs";
    if (p.format && p.format.indexOf("Templates") === 0) return "Templates";
    return "Other";
  }
  function inPrice(p) {
    if (state.price === "under6") return p.price < 6;
    if (state.price === "6to9") return p.price >= 6 && p.price <= 9;
    if (state.price === "10plus") return p.price >= 10;
    return true;
  }
  function haystack(p) {
    var inc = (p.includes && p.includes.join(" ")) || "";
    return [p.title, p.tagline, p.description, p.category, p.format, kindOf(p), inc].join(" ").toLowerCase();
  }

  function card(p, i) {
    var a = el("article", "product-card");
    var img = el("img");
    img.src = p.cover;
    img.alt = p.title + " cover";
    img.loading = i < 8 ? "eager" : "lazy";
    img.width = 600;
    img.height = 450;
    a.appendChild(img);
    var body = el("div", "product-body");
    body.appendChild(el("p", "product-cat", kindOf(p)));
    body.appendChild(el("h2", "product-title", p.title));
    body.appendChild(el("p", "product-desc", p.tagline || p.description));
    if (p.includes && p.includes.length) {
      var d = el("details", "product-includes");
      d.appendChild(el("summary", null, "What's included"));
      var ul = el("ul");
      p.includes.forEach(function (x) { ul.appendChild(el("li", null, x)); });
      d.appendChild(ul);
      body.appendChild(d);
    }
    var foot = el("div", "product-foot");
    foot.appendChild(el("span", "product-price", money(p.price)));
    if (isUrl(p.checkout_url)) {
      var b = el("a", "btn btn-copper lemonsqueezy-button", "Buy — " + money(p.price));
      b.href = p.checkout_url.trim();
      b.setAttribute("aria-label", "Buy " + p.title + " for " + money(p.price));
      foot.appendChild(b);
    } else {
      var s = el("span", "btn btn-ghost soon", "Coming soon");
      s.setAttribute("aria-disabled", "true");
      foot.appendChild(s);
    }
    body.appendChild(foot);
    a.appendChild(body);
    return a;
  }

  function applyFilters(list) {
    var q = state.q.toLowerCase();
    return list.filter(function (p) {
      if (state.kind && kindOf(p) !== state.kind) return false;
      if (state.format && p.format !== state.format) return false;
      if (!inPrice(p)) return false;
      if (q && haystack(p).indexOf(q) === -1) return false;
      return true;
    });
  }

  function sortList(list) {
    var next = list.slice();
    if (state.sort === "price-asc") next.sort(function (a, b) { return a.price - b.price; });
    else if (state.sort === "price-desc") next.sort(function (a, b) { return b.price - a.price; });
    else if (state.sort === "title") next.sort(function (a, b) { return a.title.localeCompare(b.title); });
    else {
      next.sort(function (a, b) {
        var ia = FEATURED.indexOf(a.slug);
        var ib = FEATURED.indexOf(b.slug);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }
    return next;
  }

  function filtersActive() {
    return !!(state.kind || state.q || state.format || state.price);
  }

  function syncUrl() {
    if (!grid) return;
    var params = new URLSearchParams();
    if (state.q) params.set("q", state.q);
    if (state.kind) params.set("kind", state.kind);
    if (state.format) params.set("format", state.format);
    if (state.price) params.set("price", state.price);
    if (state.sort && state.sort !== "featured") params.set("sort", state.sort);
    var qs = params.toString();
    var next = (qs ? "?" + qs : "") + (location.hash || "");
    if (next !== location.search + location.hash) {
      history.replaceState(null, "", location.pathname + next);
    }
  }

  function refreshLemon() {
    if (typeof window.createLemonSqueezy === "function") window.createLemonSqueezy();
  }

  function renderFeatured() {
    if (!featuredGrid) return;
    featuredGrid.innerHTML = "";
    var show = !grid || !filtersActive();
    if (wantedSection) wantedSection.hidden = !show;
    if (!show) return;
    var bySlug = {};
    products.forEach(function (p) { bySlug[p.slug] = p; });
    var i = 0;
    FEATURED.forEach(function (slug) {
      if (bySlug[slug]) featuredGrid.appendChild(card(bySlug[slug], i++));
    });
  }

  function renderJsonLd(list) {
    if (!grid) return;
    var id = "shop-jsonld";
    var node = document.getElementById(id);
    if (!node) {
      node = document.createElement("script");
      node.type = "application/ld+json";
      node.id = id;
      document.head.appendChild(node);
    }
    var items = (list.length ? list : products).map(function (p, i) {
      var item = {
        "@type": "Product",
        "name": p.title,
        "description": p.tagline || p.description,
        "image": ORIGIN + String(p.cover || "").replace(/^\//, ""),
        "sku": p.slug,
        "offers": {
          "@type": "Offer",
          "price": String(p.price),
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock",
          "url": p.checkout_url
        }
      };
      return { "@type": "ListItem", "position": i + 1, "item": item };
    });
    node.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      "name": "Pocketed Shop",
      "url": ORIGIN + "shop.html",
      "numberOfItems": items.length,
      "itemListElement": items
    });
  }

  function render() {
    renderFeatured();
    if (grid) {
      var filtered = applyFilters(products);
      var hidingFeatured = !filtersActive();
      var list = sortList(hidingFeatured
        ? filtered.filter(function (p) { return FEATURED.indexOf(p.slug) === -1; })
        : filtered);
      grid.innerHTML = "";
      list.forEach(function (p, i) { grid.appendChild(card(p, i)); });
      var heading = document.getElementById("all-products-heading");
      if (heading) heading.textContent = hidingFeatured ? "All other products" : "Products";
      if (count) {
        count.textContent = list.length + (list.length === 1 ? " product" : " products");
      }
      if (!list.length) {
        grid.appendChild(el("p", "fine empty-msg", "No products match. Try another search or category."));
      }
      renderJsonLd(list);
      syncUrl();
    }
    refreshLemon();
  }

  function setChipPressed() {
    if (!filters) return;
    Array.prototype.forEach.call(filters.querySelectorAll("[data-kind]"), function (x) {
      x.setAttribute("aria-pressed", x.getAttribute("data-kind") === state.kind ? "true" : "false");
    });
  }

  function chips() {
    if (!filters) return;
    filters.innerHTML = "";
    [{ label: "All", kind: "" }].concat(KINDS.map(function (k) { return { label: k, kind: k }; })).forEach(function (item) {
      var b = el("button", "chip", item.label);
      b.type = "button";
      b.setAttribute("data-kind", item.kind);
      b.setAttribute("aria-pressed", item.kind === state.kind ? "true" : "false");
      b.addEventListener("click", function () {
        state.kind = item.kind;
        setChipPressed();
        render();
      });
      filters.appendChild(b);
    });
    var calc = el("a", "chip chip-link", "Free calculator");
    calc.href = "app.html";
    filters.appendChild(calc);
    if (formatSel) {
      var seen = {};
      products.forEach(function (p) {
        if (p.format && !seen[p.format]) {
          seen[p.format] = true;
          var o = el("option", null, p.format);
          o.value = p.format;
          formatSel.appendChild(o);
        }
      });
      formatSel.value = state.format;
    }
  }

  function readUrl() {
    var params = new URLSearchParams(location.search);
    state.q = (params.get("q") || "").trim();
    state.kind = params.get("kind") || "";
    if (KINDS.indexOf(state.kind) === -1) state.kind = "";
    state.format = params.get("format") || "";
    state.price = params.get("price") || "";
    state.sort = params.get("sort") || "featured";
    if (search && state.q) search.value = state.q;
    if (sortSel) sortSel.value = state.sort;
    if (priceSel) priceSel.value = state.price;
  }

  if (search) {
    search.addEventListener("input", function () {
      state.q = search.value.trim();
      render();
    });
  }
  if (searchForm) {
    searchForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (search) state.q = search.value.trim();
      render();
    });
  }
  if (formatSel) formatSel.addEventListener("change", function () { state.format = formatSel.value; render(); });
  if (priceSel) priceSel.addEventListener("change", function () { state.price = priceSel.value; render(); });
  if (sortSel) sortSel.addEventListener("change", function () { state.sort = sortSel.value; render(); });

  readUrl();

  fetch("shop/catalog.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      products = data.products || [];
      chips();
      render();
    })
    .catch(function () {
      if (count) count.textContent = "The catalog couldn't load. Please refresh the page.";
    });
})();
