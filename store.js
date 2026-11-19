/* Pocketed store: search, mega-menu, bag, saved list, recently viewed, listing filters, product pages. */
(function () {
  "use strict";
  var D = window.PKT || { items: [], deals: [] };
  var ROOT = document.documentElement.getAttribute("data-root") || "";
  var PAGE = document.body.getAttribute("data-page") || "";
  var ITEMS = D.items;
  var BY_ID = {};
  ITEMS.forEach(function (p) { BY_ID[p.id] = p; });
  // Hand-picked starting points for the home page. Not a sales ranking.
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

  /* ---------- helpers ---------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function $all(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k === "class") e.className = v;
      else if (k.indexOf("on") === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function money(n) { return "$" + Number(n).toFixed(2); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function url(p) { return ROOT + "p/" + p.id + ".html"; }
  function img(p) { return ROOT + p.img; }
  function icon(name) {
    var paths = {
      heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
      bag: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
      check: '<path d="M5 12l5 5 9-10"/>',
      x: '<path d="M6 6l12 12M18 6L6 18"/>'
    };
    return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (paths[name] || "") + "</svg>";
  }

  /* ---------- storage ---------- */
  function load(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v : d; } catch (e) { return d; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var K_BAG = "pocketed.bag.v1", K_SAVED = "pocketed.saved.v1", K_RECENT = "pocketed.recent.v1";
  function bag() { return load(K_BAG, []).filter(function (l) { return l && BY_ID[l.id]; }); }
  function saved() { return load(K_SAVED, []).filter(function (id) { return BY_ID[id]; }); }
  function recent() { return load(K_RECENT, []).filter(function (id) { return BY_ID[id]; }); }
  function lineKey(l) { return l.id + "|" + (l.color || "") + "|" + (l.size || ""); }
  function addToBag(id, opt) {
    var p = BY_ID[id]; if (!p) return;
    var b = bag(); opt = opt || {};
    var nl = { id: id, qty: 1, color: opt.color || "", size: opt.size || "" };
    var hit = b.filter(function (l) { return lineKey(l) === lineKey(nl); })[0];
    if (hit) { if (p.d === "merch") hit.qty = Math.min(20, hit.qty + 1); }
    else b.push(nl);
    store(K_BAG, b); syncCounts();
    toast("Added to your bag: " + p.t, "bag");
  }
  function isSaved(id) { return saved().indexOf(id) !== -1; }
  function toggleSaved(id) {
    var s = saved(), i = s.indexOf(id);
    if (i === -1) s.unshift(id); else s.splice(i, 1);
    store(K_SAVED, s); syncCounts();
    $all('[data-save="' + id + '"]').forEach(function (b) { setSaveBtn(b, i === -1); });
    toast(i === -1 ? "Saved to your list" : "Removed from your saved list", "saved");
    return i === -1;
  }
  function pushRecent(id) {
    var r = recent().filter(function (x) { return x !== id; }); r.unshift(id); store(K_RECENT, r.slice(0, 12));
  }
  function syncCounts() {
    var n = bag().reduce(function (a, l) { return a + l.qty; }, 0), s = saved().length;
    $all("[data-bag-count]").forEach(function (e) { e.textContent = n; if (n) e.removeAttribute("data-zero"); else e.setAttribute("data-zero", ""); });
    $all("[data-saved-count]").forEach(function (e) { e.textContent = s; if (s) e.removeAttribute("data-zero"); else e.setAttribute("data-zero", ""); });
    $all("[data-bag-label]").forEach(function (e) { e.setAttribute("aria-label", "Bag, " + n + (n === 1 ? " item" : " items")); });
    $all("[data-saved-label]").forEach(function (e) { e.setAttribute("aria-label", "Saved list, " + s + (s === 1 ? " item" : " items")); });
  }
  window.addEventListener("storage", syncCounts);

  var toastTimer;
  function toast(msg, kind) {
    var t = $(".toast");
    if (!t) { t = el("div", { class: "toast", role: "status", "aria-live": "polite" }); document.body.appendChild(t); }
    t.innerHTML = icon("check") + "<span>" + esc(msg) + "</span>" +
      (kind === "bag" ? '<a href="' + ROOT + 'bag.html">View bag</a>' : kind === "saved" ? '<a href="' + ROOT + 'bag.html#saved">View list</a>' : "");
    t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }

  /* ---------- cards ---------- */
  function setSaveBtn(b, on) {
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", (on ? "Remove " : "Save ") + b.getAttribute("data-name") + (on ? " from your list" : " to your list"));
    b.innerHTML = icon("heart");
    var path = b.querySelector("path"); if (path) path.setAttribute("fill", on ? "currentColor" : "none");
  }
  function badgesFor(p) {
    var b = [];
    if (p.d === "digital") b.push(["Instant download", ""]);
    if (p.d === "merch") b.push(["Printed to order", "b-merch"]);
    if (p.isNew) b.push(["New", "b-new"]);
    if (p.d === "merch" && p.sizes && p.sizes.length > 1) b.push(["Sizes " + p.sizes[0] + "–" + p.sizes[p.sizes.length - 1], "b-soft"]);
    return b;
  }
  function card(p, i) {
    var a = el("article", { class: "card" });
    var media = el("a", { class: "media" + (p.d === "digital" ? " cover" : ""), href: url(p), tabindex: "-1", "aria-hidden": "true" }, [
      el("img", { src: img(p), alt: "", width: p.w, height: p.h, loading: i < 4 ? "eager" : "lazy", decoding: "async" })
    ]);
    a.appendChild(media);
    var sb = el("button", { class: "icon-btn save", type: "button", "data-save": p.id, "data-name": p.t });
    setSaveBtn(sb, isSaved(p.id));
    sb.addEventListener("click", function () { toggleSaved(p.id); });
    a.appendChild(sb);
    var body = el("div", { class: "body" });
    body.appendChild(el("div", { class: "price", text: money(p.p) }));
    body.appendChild(el("a", { class: "title", href: url(p), text: p.t }));
    body.appendChild(el("div", { class: "meta", text: p.d === "digital" ? p.fmt : p.type }));
    var bd = el("div", { class: "badges" });
    badgesFor(p).forEach(function (x) { bd.appendChild(el("span", { class: "badge " + x[1], text: x[0] })); });
    body.appendChild(bd);
    var add = el("div", { class: "add" }, [
      p.d === "merch" && (p.colors.length > 1 || p.sizes.length > 1)
        ? el("a", { class: "btn btn-outline btn-sm btn-block", href: url(p), text: "Choose options" })
        : el("button", { class: "btn btn-outline btn-sm btn-block", type: "button", text: "Add to bag", onclick: function () { addToBag(p.id); } })
    ]);
    body.appendChild(add);
    a.appendChild(body);
    return a;
  }
  function fillRow(container, list) {
    if (!container) return;
    container.innerHTML = "";
    list.forEach(function (p, i) { container.appendChild(card(p, i)); });
  }

  /* ---------- search ---------- */
  var SYN = {
    shirt: "tee", shirts: "tee", tshirt: "tee", "t-shirt": "tee", tees: "tee", apparel: "tee", clothing: "tee", clothes: "tee",
    cup: "mug", cups: "mug", coffee: "mug", mugs: "mug", bag: "tote", bags: "tote", tote: "tote",
    notebook: "journal", diary: "journal", decal: "sticker", stickers: "sticker", laptop: "sticker",
    taxes: "tax", irs: "tax", excel: "spreadsheet", sheets: "spreadsheet", sheet: "spreadsheet", xlsx: "spreadsheet", spreadsheets: "spreadsheet",
    printable: "pdf", printables: "pdf", planner: "planner", word: "docx", template: "templates",
    money: "money", budget: "money", profit: "profit", pricing: "pricing", price: "pricing", stock: "inventory",
    shipping: "shipping", postage: "shipping", gift: "gift", gifts: "gift", deals: "deals", cheap: "under"
  };
  function norm(s) { return String(s || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9$.\- ]+/g, " "); }
  function lev1(a, b) { // true if edit distance <= 1 (or one swapped pair of letters)
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      var d = []; for (var k = 0; k < a.length; k++) if (a[k] !== b[k]) d.push(k);
      if (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]]) return true;
    }
    var i = 0, j = 0, e = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++e > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return e + (a.length - i) + (b.length - j) <= 1;
  }
  ITEMS.forEach(function (p) {
    p._hay = norm([p.t, p.tag, p.c, p.k, p.fmt, p.type, (p.kw || []).join(" "), p.d === "merch" ? "merch gift tee" : "digital download"].join(" "));
    p._words = p._hay.split(/\s+/).filter(Boolean);
  });
  function tokens(q) {
    return norm(q).split(/\s+/).filter(function (w) { return w && w !== "the" && w !== "a" && w !== "for" && w !== "and"; });
  }
  function scoreItem(p, toks) {
    var s = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], alt = SYN[t], hit = 0;
      if (norm(p.t).indexOf(t) !== -1) hit = 5;
      else if (p._hay.indexOf(t) !== -1) hit = 3;
      else if (alt && p._hay.indexOf(alt) !== -1) hit = 3;
      else if (t.length >= 4 && p._words.some(function (w) { return w.length >= 4 && lev1(t, w); })) hit = 2;
      if (!hit) return 0;
      s += hit;
    }
    return s;
  }
  function search(q) {
    var toks = tokens(q);
    if (!toks.length) return ITEMS.slice();
    return ITEMS.map(function (p) { return [p, scoreItem(p, toks)]; })
      .filter(function (x) { return x[1] > 0; })
      .sort(function (a, b) { return b[1] - a[1]; })
      .map(function (x) { return x[0]; });
  }
  function hl(text, q) {
    var t = esc(text), toks = tokens(q);
    toks.forEach(function (w) { if (w.length < 2) return; t = t.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig"), "<mark>$1</mark>"); });
    return t;
  }
  function setupSearch() {
    var form = $("#search-form"), input = $("#q"), list = $("#suggest");
    if (!form || !input || !list) return;
    var params = new URLSearchParams(location.search);
    if (params.get("q")) input.value = params.get("q");
    var active = -1, opts = [];
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; }
    function go(o) { location.href = o.href; }
    function render() {
      var q = input.value.trim();
      list.innerHTML = ""; opts = []; active = -1;
      if (!q) { close(); return; }
      var res = search(q);
      var mob = window.matchMedia("(max-width: 640px)").matches;
      var nProd = mob ? 4 : 6;
      // Scope suggestions (styled differently, per Baymard)
      var scopes = [];
      var depts = {};
      res.forEach(function (p) { depts[p.d] = (depts[p.d] || 0) + 1; });
      if (depts.merch) scopes.push({ label: "in Merch", href: ROOT + "merch.html?q=" + encodeURIComponent(q), n: depts.merch });
      if (depts.digital) scopes.push({ label: "in Digital tools", href: ROOT + "digital.html?q=" + encodeURIComponent(q), n: depts.digital });
      var dealsHit = (D.deals || []).filter(function (c) { return norm(c.name + " " + c.kw).indexOf(norm(q)) !== -1; })[0];
      var add = function (o, node) { node.id = "sg-" + opts.length; node.setAttribute("role", "option"); node.setAttribute("aria-selected", "false"); node.addEventListener("mousedown", function (e) { e.preventDefault(); go(o); }); opts.push(o); list.appendChild(node); };
      add({ href: ROOT + "shop.html?q=" + encodeURIComponent(q) }, el("li", { class: "s-q", html: "<span class='s-title'>" + esc(q) + "</span><span class='muted small'>" + res.length + " results</span>" }));
      scopes.forEach(function (s) {
        add(s, el("li", { html: "<span class='s-title'>" + esc(q) + " <span class='s-scope'>" + s.label + "</span></span><span class='muted small'>" + s.n + "</span>" }));
      });
      if (dealsHit) add({ href: ROOT + "deals.html" }, el("li", { html: "<span class='s-title'>" + esc(dealsHit.name) + " <span class='s-scope'>in Deals (launching soon)</span></span>" }));
      if (res.length) {
        list.appendChild(el("li", { class: "s-head", role: "presentation", text: "Products" }));
        res.slice(0, nProd).forEach(function (p) {
          add({ href: url(p) }, el("li", { html: "<img src='" + esc(img(p)) + "' alt='' width='44' height='44'><span class='s-title'>" + hl(p.t, q) + "</span><span class='s-price'>" + money(p.p) + "</span>" }));
        });
      }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function move(d) {
      if (!opts.length) return;
      var items = $all('[role="option"]', list);
      if (active >= 0) items[active].setAttribute("aria-selected", "false");
      active = (active + d + items.length) % items.length;
      items[active].setAttribute("aria-selected", "true");
      input.setAttribute("aria-activedescendant", items[active].id);
    }
    input.addEventListener("input", render);
    input.addEventListener("focus", function () { if (input.value.trim()) render(); });
    input.addEventListener("blur", function () { setTimeout(close, 120); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) render(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Escape") { close(); }
      else if (e.key === "Enter" && active >= 0) { e.preventDefault(); go(opts[active]); }
    });
    form.addEventListener("submit", function (e) { if (!input.value.trim()) { e.preventDefault(); input.focus(); } });
  }

  /* ---------- mega menu + mobile nav ---------- */
  function setupMenu() {
    var btn = $("#dept-btn"), mega = $("#mega");
    if (!mega) return;
    var openers = $all("[data-open-mega]");
    function set(open) {
      mega.hidden = !open;
      if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
      openers.forEach(function (o) { o.setAttribute("aria-expanded", open ? "true" : "false"); });
      if (open) { var f = mega.querySelector("a,button"); if (f) f.focus(); }
    }
    if (btn) btn.addEventListener("click", function () { set(mega.hidden); });
    openers.forEach(function (o) { o.addEventListener("click", function () { window.scrollTo(0, 0); set(mega.hidden); }); });
    $all("[data-close-mega]").forEach(function (c) { c.addEventListener("click", function () { set(false); (btn || openers[0]).focus(); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !mega.hidden) { set(false); if (btn && btn.offsetParent) btn.focus(); } });
    document.addEventListener("click", function (e) {
      if (mega.hidden) return;
      if (mega.contains(e.target) || (btn && btn.contains(e.target)) || openers.some(function (o) { return o.contains(e.target); })) return;
      set(false);
    });
    $all("[data-focus-search]").forEach(function (b) { b.addEventListener("click", function () { window.scrollTo(0, 0); var q = $("#q"); if (q) q.focus(); }); });
  }

  /* ---------- Lemon Squeezy overlay ---------- */
  function refreshLemon() { if (typeof window.createLemonSqueezy === "function") window.createLemonSqueezy(); }
  function lsButton(p, label, cls) {
    return el("a", { class: "btn " + (cls || "btn-primary") + " lemonsqueezy-button", href: p.url, text: label });
  }

  /* ---------- home ---------- */
  function initHome() {
    fillRow($("#row-featured"), FEATURED.map(function (id) { return BY_ID[id]; }).filter(Boolean));
    fillRow($("#row-merch"), ITEMS.filter(function (p) { return p.d === "merch"; }));
    fillRow($("#row-bundles"), ITEMS.filter(function (p) { return p.k === "Bundles"; }));
    fillRow($("#row-under6"), ITEMS.filter(function (p) { return p.p < 6; }).sort(function (a, b) { return a.p - b.p; }).slice(0, 12));
    renderRecent();
  }
  function renderRecent(excludeId) {
    var sec = $("#recent"); if (!sec) return;
    var r = recent().filter(function (id) { return id !== excludeId; }).map(function (id) { return BY_ID[id]; });
    if (!r.length) { sec.hidden = true; return; }
    sec.hidden = false;
    fillRow($("#row-recent"), r);
    var clr = $("#clear-recent");
    if (clr) clr.onclick = function () { store(K_RECENT, []); sec.hidden = true; };
  }

  /* ---------- listing ---------- */
  var PRICE = [
    ["", "Any price"], ["u6", "Under $6"], ["6-10", "$6 to $10"], ["10-20", "$10 to $20"], ["20+", "$20 and up"]
  ];
  function inPrice(p, v) {
    if (v === "u6") return p.p < 6;
    if (v === "6-10") return p.p >= 6 && p.p <= 10;
    if (v === "10-20") return p.p > 10 && p.p <= 20;
    if (v === "20+") return p.p > 20;
    return true;
  }
  function initList() {
    var root = $("#listing"); if (!root) return;
    var fixedDept = root.getAttribute("data-dept") || "";
    var params = new URLSearchParams(location.search);
    var st = { d: fixedDept || params.get("d") || "", c: params.get("c") || "", k: params.get("k") || params.get("kind") || "", price: params.get("price") || "", q: params.get("q") || "", sort: params.get("sort") || "featured" };
    var grid = $("#grid"), count = $("#count"), chips = $("#chips"), form = $("#filters"), title = $("#list-title"), crumbs = $("#crumb-current"), sortSel = $("#sort");
    if (sortSel) sortSel.value = st.sort;

    function base() { return ITEMS.filter(function (p) { return !st.d || p.d === st.d; }); }
    function apply(list, skip) {
      return list.filter(function (p) {
        if (skip !== "c" && st.c && p.c !== st.c) return false;
        if (skip !== "k" && st.k && p.k !== st.k) return false;
        if (skip !== "price" && !inPrice(p, st.price)) return false;
        return true;
      });
    }
    function group(name, legend, values, cur, counts) {
      var fs = el("fieldset"); fs.appendChild(el("legend", { text: legend }));
      values.forEach(function (v) {
        var id = "f-" + name + "-" + (v[0] || "all").replace(/[^a-z0-9]+/gi, "-");
        var inp = el("input", { type: "radio", name: name, id: id, value: v[0] });
        if (cur === v[0]) inp.checked = true;
        inp.addEventListener("change", function () { st[name] = v[0]; if (name === "d") { st.c = ""; st.k = ""; } update(); });
        var lab = el("label", { for: id }, [inp, el("span", { text: v[1] })]);
        if (counts && v[0]) lab.appendChild(el("span", { class: "cnt", text: String(counts[v[0]] || 0) }));
        fs.appendChild(lab);
      });
      return fs;
    }
    function renderFilters(pool) {
      if (!form) return;
      var keep = form.querySelector(".filters-head"), apply2 = form.querySelector(".filters-apply");
      $all("fieldset", form).forEach(function (f) { f.remove(); });
      var frag = document.createDocumentFragment();
      if (!fixedDept) {
        var dc = {}; pool.forEach(function (p) { dc[p.d] = (dc[p.d] || 0) + 1; });
        frag.appendChild(group("d", "Department", [["", "All departments"], ["digital", "Digital tools"], ["merch", "Merch"]], st.d, dc));
      }
      var b = pool.filter(function (p) { return !st.d || p.d === st.d; });
      var cc = {}; apply(b, "c").forEach(function (p) { cc[p.c] = (cc[p.c] || 0) + 1; });
      var cats = Object.keys(D.cats).filter(function (c) { return !st.d || D.cats[c] === st.d; });
      frag.appendChild(group("c", "Category", [["", "All categories"]].concat(cats.map(function (c) { return [c, c]; })), st.c, cc));
      if (st.d !== "merch") {
        var kc = {}; apply(b, "k").forEach(function (p) { if (p.d === "digital") kc[p.k] = (kc[p.k] || 0) + 1; });
        frag.appendChild(group("k", "File type", [["", "Any type"]].concat(D.kinds.map(function (k) { return [k, k]; })), st.k, kc));
      }
      var pc = {}; apply(b, "price").forEach(function (p) { PRICE.forEach(function (r) { if (r[0] && inPrice(p, r[0])) pc[r[0]] = (pc[r[0]] || 0) + 1; }); });
      frag.appendChild(group("price", "Price", PRICE, st.price, pc));
      form.insertBefore(frag, apply2 || null);
      if (keep) form.insertBefore(keep, form.firstChild);
    }
    function sortList(list) {
      var s = st.sort;
      if (s === "low") return list.sort(function (a, b) { return a.p - b.p || a.t.localeCompare(b.t); });
      if (s === "high") return list.sort(function (a, b) { return b.p - a.p || a.t.localeCompare(b.t); });
      if (s === "az") return list.sort(function (a, b) { return a.t.localeCompare(b.t); });
      if (s === "new") return list.sort(function (a, b) { return (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0); });
      return list;
    }
    function update() {
      var pool = st.q ? search(st.q) : ITEMS.slice();
      if (st.q && st.sort === "featured") { /* relevance order from search */ }
      renderFilters(pool);
      var list = sortList(apply(pool.filter(function (p) { return !st.d || p.d === st.d; })));
      grid.innerHTML = "";
      list.forEach(function (p, i) { grid.appendChild(card(p, i)); });
      var label = st.c || st.k || (st.d === "merch" ? "Merch" : st.d === "digital" ? "Digital tools" : "All products");
      if (title) title.textContent = st.q ? "Results for “" + st.q + "”" : label;
      if (crumbs) crumbs.textContent = st.q ? "Search" : label;
      document.title = (st.q ? "“" + st.q + "” – " : label + " – ") + "Pocketed";
      count.textContent = list.length + (list.length === 1 ? " item" : " items");
      // chips
      chips.innerHTML = "";
      var on = [];
      if (st.q) on.push(["q", "“" + st.q + "”"]);
      if (!fixedDept && st.d) on.push(["d", st.d === "merch" ? "Merch" : "Digital tools"]);
      if (st.c) on.push(["c", st.c]);
      if (st.k) on.push(["k", st.k]);
      if (st.price) on.push(["price", PRICE.filter(function (r) { return r[0] === st.price; })[0][1]]);
      on.forEach(function (o) {
        chips.appendChild(el("button", { class: "chip on", type: "button", "aria-label": "Remove filter " + o[1], html: esc(o[1]) + " " + icon("x"), onclick: function () { st[o[0]] = ""; if (o[0] === "q") { var qi = $("#q"); if (qi) qi.value = ""; } update(); } }));
      });
      if (on.length > 1) chips.appendChild(el("button", { class: "chip", type: "button", text: "Clear all", onclick: function () { st.q = ""; st.c = ""; st.k = ""; st.price = ""; if (!fixedDept) st.d = ""; var qi = $("#q"); if (qi) qi.value = ""; update(); } }));
      $("#empty").hidden = list.length > 0;
      var qs = new URLSearchParams();
      ["d", "c", "k", "price", "q"].forEach(function (k) { if (st[k] && !(k === "d" && fixedDept)) qs.set(k, st[k]); });
      if (st.sort !== "featured") qs.set("sort", st.sort);
      var s = qs.toString();
      history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
    }
    if (sortSel) sortSel.addEventListener("change", function () { st.sort = sortSel.value; update(); });
    // mobile filter drawer
    var tog = $("#filter-toggle"), scrim;
    function drawer(open) {
      form.classList.toggle("open", open);
      tog.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) { scrim = el("div", { class: "scrim", onclick: function () { drawer(false); } }); document.body.appendChild(scrim); var f = form.querySelector("button,input"); if (f) f.focus(); }
      else if (scrim) { scrim.remove(); scrim = null; tog.focus(); }
    }
    if (tog) tog.addEventListener("click", function () { drawer(!form.classList.contains("open")); });
    $all("[data-close-filters]").forEach(function (b) { b.addEventListener("click", function () { drawer(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && form.classList.contains("open")) drawer(false); });
    update();
  }

  /* ---------- product page ---------- */
  function initProduct() {
    var id = document.body.getAttribute("data-id"), p = BY_ID[id];
    if (!p) return;
    pushRecent(id);
    var opt = { color: "", size: "" };
    // gallery
    var mainImg = $("#main-img");
    $all(".thumbs button").forEach(function (b) {
      b.addEventListener("click", function () {
        $all(".thumbs button").forEach(function (x) { x.setAttribute("aria-current", "false"); });
        b.setAttribute("aria-current", "true");
        mainImg.src = b.getAttribute("data-src"); mainImg.alt = b.getAttribute("data-alt");
      });
    });
    // options
    $all(".opts").forEach(function (g) {
      var name = g.getAttribute("data-opt");
      var btns = $all("button", g);
      if (btns.length === 1) { opt[name] = btns[0].getAttribute("data-val"); btns[0].setAttribute("aria-pressed", "true"); }
      btns.forEach(function (b) {
        b.addEventListener("click", function () {
          btns.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true"); opt[name] = b.getAttribute("data-val");
          var lab = $("#opt-" + name + "-val"); if (lab) lab.textContent = opt[name];
          var w = $("#opt-warn"); if (w) w.hidden = true;
        });
      });
    });
    var addBtn = $("#add-bag");
    if (addBtn) addBtn.addEventListener("click", function () {
      if (p.d === "merch" && ((p.colors.length > 1 && !opt.color) || (p.sizes.length > 1 && !opt.size))) {
        var w = $("#opt-warn"); w.hidden = false; w.focus(); return;
      }
      addToBag(p.id, opt);
    });
    var sv = $("#save-item");
    if (sv) {
      var paint = function () { var on = isSaved(p.id); sv.setAttribute("aria-pressed", on ? "true" : "false"); sv.lastChild.textContent = on ? " Saved" : " Save for later"; };
      paint(); sv.addEventListener("click", function () { toggleSaved(p.id); paint(); });
    }
    fillRow($("#row-related"), ITEMS.filter(function (x) { return x.id !== p.id && (x.c === p.c || (p.d === "merch" && x.d === "merch")); }).slice(0, 12));
    renderRecent(p.id);
  }

  /* ---------- bag ---------- */
  function initBag() {
    var lsBox = $("#bag-ls"), pfBox = $("#bag-pf"), savedBox = $("#saved-list");
    function line(l, idx) {
      var p = BY_ID[l.id];
      var opts = [l.color, l.size].filter(Boolean).join(" · ");
      var act = el("div", { class: "lact" });
      if (p.d === "merch") {
        var q = el("div", { class: "qty", role: "group", "aria-label": "Quantity for " + p.t }, [
          el("button", { type: "button", "aria-label": "Decrease quantity", text: "−", onclick: function () { setQty(idx, l.qty - 1); } }),
          el("span", { text: String(l.qty), "aria-live": "polite" }),
          el("button", { type: "button", "aria-label": "Increase quantity", text: "+", onclick: function () { setQty(idx, l.qty + 1); } })
        ]);
        act.appendChild(q);
        act.appendChild(el("a", { class: "btn btn-forest btn-sm", href: p.url, target: "_blank", rel: "noopener", text: "Buy on Printify ↗", "aria-label": "Buy " + p.t + " on Printify (opens in a new tab)" }));
      } else {
        act.appendChild(lsButton(p, "Check out · " + money(p.p), "btn-primary btn-sm"));
      }
      act.appendChild(el("button", { class: "linkbtn", type: "button", text: "Save for later", onclick: function () { if (!isSaved(p.id)) toggleSaved(p.id); remove(idx); } }));
      act.appendChild(el("button", { class: "linkbtn", type: "button", text: "Remove", onclick: function () { remove(idx); } }));
      return el("div", { class: "line" }, [
        el("img", { src: img(p), alt: "", width: 84, height: 84, loading: "lazy" }),
        el("div", null, [
          el("a", { class: "lt", href: url(p), text: p.t }),
          el("div", { class: "lmeta", text: money(p.p) + (opts ? " · " + opts : "") + (p.d === "merch" && l.qty > 1 ? " · " + l.qty + " × " + money(p.p) : "") }),
          act
        ])
      ]);
    }
    function setQty(i, n) { var b = bag(); if (n < 1) return remove(i); b[i].qty = Math.min(20, n); store(K_BAG, b); render(); }
    function remove(i) { var b = bag(); b.splice(i, 1); store(K_BAG, b); render(); }
    function render() {
      syncCounts();
      var b = bag();
      $("#bag-empty").hidden = b.length > 0;
      var ls = [], pf = [];
      b.forEach(function (l, i) { (BY_ID[l.id].d === "merch" ? pf : ls).push([l, i]); });
      [[lsBox, ls], [pfBox, pf]].forEach(function (x) {
        var box = x[0], arr = x[1], listEl = box.querySelector(".lines");
        box.hidden = !arr.length; listEl.innerHTML = "";
        arr.forEach(function (y) { listEl.appendChild(line(y[0], y[1])); });
      });
      var sub = function (arr) { return arr.reduce(function (a, y) { return a + BY_ID[y[0].id].p * y[0].qty; }, 0); };
      $("#sum-ls").textContent = money(sub(ls));
      $("#sum-pf").textContent = money(sub(pf));
      $("#sum-tot").textContent = money(sub(ls) + sub(pf));
      $("#sum-n").textContent = b.reduce(function (a, l) { return a + l.qty; }, 0);
      // saved
      var s = saved();
      savedBox.innerHTML = "";
      $("#saved-empty").hidden = s.length > 0;
      s.forEach(function (id, i) { savedBox.appendChild(card(BY_ID[id], i)); });
      refreshLemon();
    }
    window.addEventListener("storage", render);
    document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-save]")) setTimeout(render, 0); });
    render();
    fillRow($("#row-recent"), recent().map(function (id) { return BY_ID[id]; }));
    var rs = $("#recent"); if (rs) rs.hidden = !recent().length;
  }

  /* ---------- deals notify (no backend: opens an email) ---------- */
  function initDeals() {
    var f = $("#notify-form"); if (!f) return;
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var picks = $all("input[name=cat]:checked", f).map(function (x) { return x.value; }).join(", ");
      var body = "Please email me when Pocketed Deals opens." + (picks ? "\n\nCategories I'm interested in: " + picks : "");
      location.href = "mailto:" + D.contact + "?subject=" + encodeURIComponent("Notify me: Pocketed Deals launch") + "&body=" + encodeURIComponent(body);
      var m = $("#notify-msg"); if (m) { m.hidden = false; }
    });
  }

  /* ---------- boot ---------- */
  setupSearch();
  setupMenu();
  syncCounts();
  if (PAGE === "home") initHome();
  if (PAGE === "list") initList();
  if (PAGE === "product") initProduct();
  if (PAGE === "bag") initBag();
  if (PAGE === "deals") initDeals();
  if (PAGE === "content" || PAGE === "deals") renderRecent();
  refreshLemon();
  window.PocketedStore = { search: search, addToBag: addToBag, toggleSaved: toggleSaved, FEATURED: FEATURED };
})();
