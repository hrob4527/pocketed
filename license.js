/**
 * Pocketed Pro license gating.
 * Uses Lemon Squeezy's public License API (no secret key; CORS allows browser calls).
 * Docs: https://docs.lemonsqueezy.com/api/license-api
 *
 * Everything is injectable (fetch, storage, clock) so test.js can mock it.
 */
(function (root) {
  "use strict";

  // Ids read from the public checkout page for
  // https://pcketedapp.lemonsqueezy.com/checkout/buy/44e338e5-789f-4146-938b-cc03b61c46f0
  const CONFIG = {
    API_BASE: "https://api.lemonsqueezy.com/v1/licenses",
    STORE_ID: 521551, // store slug "pcketedapp"
    PRODUCT_ID: 1519948, // "Pocketed Pro"
    PRODUCT_NAME: "Pocketed Pro",
    STORAGE_KEY: "pocketed.license.v1",
    FREE_IMPORTS_KEY: "pocketed.freeImports.v1",
    FREE_IMPORT_LIMIT: 1,
    // A key validated online keeps working offline for this long.
    GRACE_MS: 14 * 24 * 60 * 60 * 1000,
  };

  function defaultFetch() {
    return typeof root.fetch === "function" ? root.fetch.bind(root) : null;
  }
  function defaultStorage() {
    try {
      return root.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function readState(storage) {
    storage = storage || defaultStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && typeof s.key === "string" && s.key ? s : null;
    } catch (e) {
      return null;
    }
  }
  function writeState(storage, state) {
    storage = storage || defaultStorage();
    if (!storage) return;
    try {
      storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Private mode or full storage: Pro still works for this page view.
    }
  }
  function clearState(storage) {
    storage = storage || defaultStorage();
    if (!storage) return;
    try {
      storage.removeItem(CONFIG.STORAGE_KEY);
    } catch (e) {}
  }

  /** Does a License API meta block belong to our store and product? */
  function matchesProduct(meta) {
    if (!meta) return false;
    if (Number(meta.store_id) !== CONFIG.STORE_ID) return false;
    if (CONFIG.PRODUCT_ID != null) return Number(meta.product_id) === CONFIG.PRODUCT_ID;
    return String(meta.product_name || "").trim() === CONFIG.PRODUCT_NAME;
  }

  /** Synchronous check from cached state: validated online within the grace window. */
  function isPro(opts) {
    opts = opts || {};
    const state = readState(opts.storage);
    if (!state || !state.instanceId || typeof state.validatedAt !== "number") return false;
    const now = opts.now ? opts.now() : Date.now();
    return now - state.validatedAt <= CONFIG.GRACE_MS && now >= state.validatedAt - 60000;
  }

  function maskKey(key) {
    const k = String(key || "");
    return k.length > 4 ? "••••" + k.slice(-4) : k;
  }

  /**
   * POST form-encoded to the License API.
   * Resolves { network: true } on a transport failure, or { status, body } otherwise.
   */
  function post(path, params, fetchImpl) {
    const f = fetchImpl || defaultFetch();
    if (!f) return Promise.resolve({ network: true, error: "No network available." });
    const body = new URLSearchParams(params).toString();
    return Promise.resolve()
      .then(() =>
        f(CONFIG.API_BASE + "/" + path, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
          body,
        })
      )
      .then((res) =>
        res
          .json()
          .catch(() => ({}))
          .then((json) => ({ status: res.status, body: json || {} }))
      )
      .catch((err) => ({ network: true, error: String((err && err.message) || err) }));
  }

  // Server trouble or rate limiting is treated like being offline, not like a bad key.
  function isTransient(r) {
    return r.network || r.status === 429 || r.status >= 500;
  }

  function wrongProductMessage() {
    return "That key is for a different product. Use the key from your " + CONFIG.PRODUCT_NAME + " receipt.";
  }

  /** Activate a key on this browser. */
  function activate(key, opts) {
    opts = opts || {};
    const licenseKey = String(key || "").trim();
    if (!licenseKey) return Promise.resolve({ ok: false, error: "Paste the license key from your receipt email." });
    const now = opts.now ? opts.now() : Date.now();
    const instanceName = opts.instanceName || "Pocketed web " + new Date(now).toISOString().slice(0, 10);
    return post("activate", { license_key: licenseKey, instance_name: instanceName }, opts.fetch).then((r) => {
      if (isTransient(r)) return { ok: false, error: "Couldn’t reach Lemon Squeezy. Check your connection and try again." };
      const b = r.body;
      if (b.meta && !matchesProduct(b.meta)) {
        // Free the activation slot we may have just used on someone else's product.
        if (b.activated && b.instance && b.instance.id) {
          post("deactivate", { license_key: licenseKey, instance_id: b.instance.id }, opts.fetch);
        }
        return { ok: false, error: wrongProductMessage() };
      }
      if (!b.activated || !b.instance || !b.instance.id) {
        return { ok: false, error: b.error || "That license key couldn’t be activated." };
      }
      const state = {
        key: licenseKey,
        instanceId: b.instance.id,
        validatedAt: now,
        productName: (b.meta && b.meta.product_name) || CONFIG.PRODUCT_NAME,
      };
      writeState(opts.storage, state);
      return { ok: true, state };
    });
  }

  /**
   * Re-check the stored key online. On a definite "not valid" answer the key is removed.
   * On a network problem the cached result stands until the grace window runs out.
   * Resolves { pro, reason, offline? }.
   */
  function validateStored(opts) {
    opts = opts || {};
    const state = readState(opts.storage);
    if (!state || !state.instanceId) return Promise.resolve({ pro: false, reason: "none" });
    const now = opts.now ? opts.now() : Date.now();
    return post("validate", { license_key: state.key, instance_id: state.instanceId }, opts.fetch).then((r) => {
      if (isTransient(r)) {
        const pro = isPro(opts);
        return { pro, offline: true, reason: pro ? "grace" : "grace-expired" };
      }
      const b = r.body;
      const status = b.license_key && b.license_key.status;
      const ok =
        b.valid === true &&
        matchesProduct(b.meta) &&
        b.instance &&
        b.instance.id === state.instanceId &&
        status !== "disabled" &&
        status !== "expired";
      if (!ok) {
        clearState(opts.storage);
        return { pro: false, reason: b.meta && !matchesProduct(b.meta) ? "wrong-product" : "invalid", error: b.error || null };
      }
      writeState(opts.storage, Object.assign({}, state, { validatedAt: now }));
      return { pro: true, reason: "valid" };
    });
  }

  /** Remove the key from this browser and free its activation slot when online. */
  function deactivate(opts) {
    opts = opts || {};
    const state = readState(opts.storage);
    clearState(opts.storage);
    if (!state || !state.instanceId) return Promise.resolve({ ok: true, remote: false });
    return post("deactivate", { license_key: state.key, instance_id: state.instanceId }, opts.fetch).then((r) => ({
      ok: true,
      remote: !isTransient(r) && r.body && r.body.deactivated === true,
    }));
  }

  // Free tier: one of your own payout CSVs (sample files are always free).
  function freeImportsUsed(storage) {
    storage = storage || defaultStorage();
    try {
      return Number((storage && storage.getItem(CONFIG.FREE_IMPORTS_KEY)) || 0) || 0;
    } catch (e) {
      return 0;
    }
  }
  function canImportOwnCsv(opts) {
    opts = opts || {};
    return isPro(opts) || freeImportsUsed(opts.storage) < CONFIG.FREE_IMPORT_LIMIT;
  }
  function recordOwnCsvImport(opts) {
    opts = opts || {};
    if (isPro(opts)) return;
    const storage = opts.storage || defaultStorage();
    try {
      storage && storage.setItem(CONFIG.FREE_IMPORTS_KEY, String(freeImportsUsed(storage) + 1));
    } catch (e) {}
  }

  root.PocketedLicense = {
    CONFIG,
    matchesProduct,
    isPro,
    activate,
    validateStored,
    deactivate,
    readState,
    clearState,
    maskKey,
    canImportOwnCsv,
    recordOwnCsvImport,
    freeImportsUsed,
  };
})(typeof window !== "undefined" ? window : globalThis);
