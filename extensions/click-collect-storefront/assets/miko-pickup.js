/*
 * Two jobs, both of them about surviving somebody else's theme.
 *
 * 1. Put the embed where a shopper will read it. An app embed renders at the
 *    end of <body>, which is nowhere. This finds the buy button and moves the
 *    block next to it.
 * 2. Keep it honest when the variant changes. Every variant's availability is
 *    already in the page, so this only has to reveal the right one — no fetch,
 *    and no dependency on the theme announcing variant changes in any
 *    particular way, because themes do not agree on that and never have.
 */
(function () {
  "use strict";

  var PLACED = "data-miko-cc-placed";

  /* Ordered widest-to-narrowest: the first match wins, so a real buy-buttons
     block beats a bare form. Covers Dawn, Horizon and the common OS 2.0 themes;
     the last entry is the generic fallback for everything else. */
  var BUY_SELECTORS = [
    ".product-form__buttons",
    "product-form .product-form__buttons",
    ".shopify-payment-button",
    'form[action*="/cart/add"] .product-form__submit',
    'form[action*="/cart/add"] [type="submit"]',
    'form[action*="/cart/add"]',
  ];

  function findBuyArea() {
    for (var i = 0; i < BUY_SELECTORS.length; i++) {
      var el = document.querySelector(BUY_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function place(embed) {
    if (embed.hasAttribute(PLACED)) return true;

    var anchor = findBuyArea();
    if (!anchor) return false;

    // The submit button itself is not a useful neighbour — go up to whatever
    // block contains it so the notice sits with the buy area, not inside it.
    var target = anchor;
    if (target.tagName === "BUTTON" || target.tagName === "INPUT") {
      target = target.closest(".product-form__buttons") || target.parentElement || target;
    }

    if (embed.getAttribute("data-position") === "before_buy") {
      target.parentNode.insertBefore(embed, target);
    } else {
      target.parentNode.insertBefore(embed, target.nextSibling);
    }

    embed.setAttribute(PLACED, "1");
    embed.hidden = false;
    return true;
  }

  function currentVariantId() {
    // The URL is the one place every theme agrees on after a variant change.
    var fromUrl = new URLSearchParams(window.location.search).get("variant");
    if (fromUrl) return fromUrl;

    var input = document.querySelector(
      'form[action*="/cart/add"] [name="id"]:checked, form[action*="/cart/add"] [name="id"]'
    );
    return input && input.value ? input.value : null;
  }

  function show(root, variantId) {
    var panels = root.querySelectorAll("[data-miko-cc-variant]");
    if (!panels.length) return;

    var wanted = variantId || root.getAttribute("data-selected");
    var matched = false;

    for (var i = 0; i < panels.length; i++) {
      var isMatch = panels[i].getAttribute("data-miko-cc-variant") === String(wanted);
      panels[i].hidden = !isMatch;
      if (isMatch) matched = true;
    }

    // An id we have no panel for (a theme doing something unusual, or a variant
    // that did not exist when the page rendered). Fall back to the first panel
    // rather than showing the shopper an empty space.
    if (!matched) panels[0].hidden = false;
  }

  function sync() {
    var id = currentVariantId();
    var roots = document.querySelectorAll("[data-miko-cc]");
    for (var i = 0; i < roots.length; i++) show(roots[i], id);
  }

  function init() {
    var embed = document.querySelector("[data-miko-cc-embed]");
    if (embed && !place(embed)) {
      // Themes that build the buy button with JS are not ready on first paint.
      // Watch until it appears, then stop watching.
      var observer = new MutationObserver(function () {
        if (place(embed)) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { observer.disconnect(); }, 10000);
    }
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Variant changes: themes announce them differently, and some only change the
  // URL. Listen for everything plausible, and poll the URL as the backstop.
  ["variant:change", "variantChange", "product:variant-change", "change"].forEach(function (name) {
    document.addEventListener(name, sync, true);
  });
  window.addEventListener("popstate", sync);

  var lastSearch = window.location.search;
  setInterval(function () {
    if (window.location.search !== lastSearch) {
      lastSearch = window.location.search;
      sync();
    }
  }, 400);
})();
