/**
 * Click and Collect - Service Fee Cart Transform
 *
 * When the customer selects in-store pickup and the location has a service fee,
 * the checkout extension sets the "miko_service_fee" cart attribute with the
 * dollar amount. This function distributes that fee across all line items
 * proportionally by adding their fair share to each unit's price.
 *
 * Example: $6 fee, 3 total units → $2/unit added to each item's per-unit price.
 * Rounding remainder is added to the first line item.
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";
  const rawFee = input.cart.serviceFee?.value;

  if (!isPickup || !rawFee) return { operations: [] };

  const feeCents = Math.round(parseFloat(rawFee) * 100);
  if (!feeCents || feeCents <= 0) return { operations: [] };

  const lines = input.cart.lines.filter(
    (l) => l.merchandise?.__typename === "ProductVariant"
  );
  if (lines.length === 0) return { operations: [] };

  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);
  const feePerUnitCents = Math.floor(feeCents / totalUnits);
  let remainder = feeCents - feePerUnitCents * totalUnits;

  const operations = lines.map((line) => {
    const originalCents = Math.round(parseFloat(line.merchandise.price.amount) * 100);
    // First line item absorbs the rounding remainder
    const thisLineFeePerUnit = feePerUnitCents + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder = Math.max(0, remainder - line.quantity);

    const newPriceCents = originalCents + thisLineFeePerUnit;
    const newPrice = (newPriceCents / 100).toFixed(2);

    return {
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: { amount: newPrice },
          },
        },
      },
    };
  });

  return { operations };
}
