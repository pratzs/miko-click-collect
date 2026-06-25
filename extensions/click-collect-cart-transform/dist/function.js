var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// extensions/click-collect-cart-transform/src/index.js
var src_exports = {};
__export(src_exports, {
  default: () => run
});
function run(input) {
  const operations = [];
  for (const line of input.cart.lines) {
    const feeAttr = line.attribute?.value;
    if (!feeAttr) continue;
    const amount = parseFloat(feeAttr);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: amount.toFixed(2) }
          }
        }
      }
    });
  }
  return { operations };
}

// extensions/click-collect-cart-transform/node_modules/@shopify/shopify_function/run.ts
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

// extensions/click-collect-cart-transform/node_modules/@shopify/shopify_function/index.ts
run_default(src_exports?.default);
