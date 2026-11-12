(function () {
  "use strict";
  var grid = document.getElementById("shop-grid");
  var search = document.getElementById("shop-search");
  var filters = document.getElementById("shop-filters");
  var formatSel = document.getElementById("shop-format");
  var sortSel = document.getElementById("shop-sort");
  var count = document.getElementById("shop-count");
  var products = [];
  var state = { category: "", q: "", format: "", sort: "featured" };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function isUrl(u) { return typeof u === "string" && /^https:\/\/[^\s]+$/.test(u.trim()); }
  function money(n) { return "$" + Number(n).toFixed(n % 1 ? 2 : 0); }

  function card(p, i) {
    var a = el("article", "product-card");
    var img = el("img"); img.src = p.cover; img.alt = p.title + " cover"; img.loading = i < 6 ? "eager" : "lazy";
    img.width = 600; img.height = 450;
    a.appendChild(img);
    var body = el("div", "product-body");
    body.appendChild(el("p", "product-cat", p.category + " · " + p.format));
    body.appendChild(el("h2", "product-title", p.title));
    body.appendChild(el("p", "product-desc", p.description));
    if (p.includes && p.includes.length) {
      var d = el("details", "product-includes");
      d.appendChild(el("summary", null, "What's included"));
      var ul = el("ul");
      p.includes.forEach(function (x) { ul.appendChild(el("li", null, x)); });
      d.appendChild(ul); body.appendChild(d);
    }
    var foot = el("div", "product-foot");
    foot.appendChild(el("span", "product-price", money(p.price)));
    if (isUrl(p.checkout_url)) {
      var b = el("a", "btn btn-copper lemonsqueezy-button", "Buy");
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

  function render() {
    var q = state.q.toLowerCase();
    var list = products.filter(function (p) {
      if (state.category && p.category !== state.category) return false;
      if (state.format && p.format !== state.format) return false;
      if (q && (p.title + " " + p.description + " " + p.category).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    if (state.sort === "price-asc") list.sort(function (a, b) { return a.price - b.price; });
    else if (state.sort === "price-desc") list.sort(function (a, b) { return b.price - a.price; });
    else if (state.sort === "title") list.sort(function (a, b) { return a.title.localeCompare(b.title); });
    grid.innerHTML = "";
    list.forEach(function (p, i) { grid.appendChild(card(p, i)); });
    count.textContent = list.length + (list.length === 1 ? " product" : " products");
    if (!list.length) grid.appendChild(el("p", "fine", "No products match. Try another search or category."));
    if (typeof window.createLemonSqueezy === "function") window.createLemonSqueezy();
  }

  function chips() {
    var cats = [""].concat(products.map(function (p) { return p.category; }).filter(function (c, i, a) { return a.indexOf(c) === i; }));
    cats.forEach(function (c) {
      var b = el("button", "chip", c || "All");
      b.type = "button"; b.setAttribute("aria-pressed", c === state.category ? "true" : "false");
      b.addEventListener("click", function () {
        state.category = c;
        Array.prototype.forEach.call(filters.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        render();
      });
      filters.appendChild(b);
    });
    products.map(function (p) { return p.format; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).forEach(function (f) {
      var o = el("option", null, f); o.value = f; formatSel.appendChild(o);
    });
  }

  search.addEventListener("input", function () { state.q = search.value.trim(); render(); });
  formatSel.addEventListener("change", function () { state.format = formatSel.value; render(); });
  sortSel.addEventListener("change", function () { state.sort = sortSel.value; render(); });

  fetch("shop/catalog.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { products = data.products || []; chips(); render(); })
    .catch(function () { count.textContent = "The catalog couldn't load. Please refresh the page."; });
})();
