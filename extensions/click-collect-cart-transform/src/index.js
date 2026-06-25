/**
 * Sets the price of the "Click and Collect Service Fee" line item based on the
 * miko_fee_amount line attribute set by the checkout extension.
 * Removes the line (effectively) by setting price to $0 when the customer
 * crosses the free-above threshold mid-checkout.
 */
export default function run(input) {
  const operations = [];
  for (const line of input.cart.lines) {
    const feeAttr = line.attribute?.value;
    if (feeAttr === null || feeAttr === undefined) continue;
    const amount = parseFloat(feeAttr);
    if (!Number.isFinite(amount) || amount < 0) continue;
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
