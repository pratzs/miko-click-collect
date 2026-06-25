var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// extensions/click-collect-delivery-customization/src/index.js
var src_exports = {};
__export(src_exports, {
  default: () => run
});
var PICKUP_KEYWORDS = /pickup|collect|in.?store|local/i;
function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";
  if (!isPickup) return { operations: [] };
  const allGroups = input.cart.deliveryGroups ?? [];
  const hasPickupRate = allGroups.some(
    (group) => group.deliveryOptions.some((opt) => PICKUP_KEYWORDS.test(opt.title ?? ""))
  );
  if (!hasPickupRate) {
    return { operations: [] };
  }
  const operations = allGroups.flatMap(
    (group) => group.deliveryOptions.filter((opt) => !PICKUP_KEYWORDS.test(opt.title ?? "")).map((opt) => ({ hide: { deliveryOptionHandle: opt.handle } }))
  );
  return { operations };
}

// extensions/click-collect-delivery-customization/node_modules/@shopify/shopify_function/run.ts
function run_default(userfunction) {
  try {
    ShopifyFunction;
  } catch (e) {
    throw new Error(
      "ShopifyFunction is not defined. Please rebuild your function using the latest version of Shopify CLI."
    );
  }
  const input_obj = ShopifyFunction.readInput();
  const output_obj = userfunction(input_obj);
  ShopifyFunction.writeOutput(output_obj);
}

// extensions/click-collect-delivery-customization/node_modules/@shopify/shopify_function/index.ts
run_default(src_exports?.default);
