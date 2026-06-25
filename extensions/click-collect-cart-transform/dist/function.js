var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// extensions/click-collect-cart-transform/src/index.js
var src_exports = {};
__export(src_exports, {
  run: () => run
});
function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";
  const rawFee = input.cart.serviceFee?.value;
  if (!isPickup || !rawFee) return { operations: [] };
  const feeCents = Math.round(parseFloat(rawFee) * 100);
  if (!feeCents || feeCents <= 0) return { operations: [] };
  const lines = input.cart.lines;
  if (!lines || lines.length === 0) return { operations: [] };
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);
  const feePerUnitCents = Math.floor(feeCents / totalUnits);
  let remainder = feeCents - feePerUnitCents * totalUnits;
  const operations = lines.map((line) => {
    const originalCents = Math.round(
      parseFloat(line.cost.amountPerQuantity.amount) * 100
    );
    const thisLineFeePerUnit = feePerUnitCents + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder = Math.max(0, remainder - line.quantity);
    const newPrice = ((originalCents + thisLineFeePerUnit) / 100).toFixed(2);
    return {
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: newPrice }
          }
        }
      }
    };
  });
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
