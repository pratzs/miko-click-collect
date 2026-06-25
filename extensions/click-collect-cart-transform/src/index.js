/**
 * Click and Collect - Service Fee Cart Transform
 *
 * The checkout extension adds the shop's "Click and Collect Service Fee" variant
 * to the cart as a line item with attribute miko_fee_amount = "6.00" (the location's
 * configured fee). This function sets that line item's actual price to the fee amount.
 *
 * Why a transform: cart line items can only be added at their variant's existing price
 * ($0). We need a dynamic per-location amount — this function rewrites the price.
 */
export default function run(input) {
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
            fixedPricePerUnit: { amount: amount.toFixed(2) },
          },
        },
      },
    });
  }

  return { operations };
}
