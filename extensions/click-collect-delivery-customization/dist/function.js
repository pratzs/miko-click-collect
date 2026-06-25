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
var RATE_PREFIX = "Click and Collect";
function run(input) {
  const allGroups = input.cart.deliveryGroups ?? [];
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";
  const selectedLocationName = input.cart.locationName?.value ?? "";
  const operations = [];
  for (const group of allGroups) {
    for (const opt of group.deliveryOptions) {
      const title = opt.title ?? "";
      const isPickupRate = title.startsWith(RATE_PREFIX);
      if (isPickup) {
        if (isPickupRate) {
          const expectedName = `${RATE_PREFIX} - ${selectedLocationName}`;
          if (title !== expectedName) {
            operations.push({ hide: { deliveryOptionHandle: opt.handle } });
          }
        } else {
          operations.push({ hide: { deliveryOptionHandle: opt.handle } });
        }
      } else {
        if (isPickupRate) {
          operations.push({ hide: { deliveryOptionHandle: opt.handle } });
        }
      }
    }
  }
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
