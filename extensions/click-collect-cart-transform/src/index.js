/**
 * Click and Collect - Service Fee Cart Transform
 *
 * When the customer selects in-store pickup and the location charges a service fee,
 * the checkout extension sets "miko_service_fee" in cart attributes. This function
 * distributes that fee proportionally across all line items by adding each unit's
 * share to the per-unit price using fixedPricePerUnit.
 *
 * Example: $6 fee, 3 total units → $2/unit added. Rounding remainder goes to
 * the first line item.
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export default function run(input) {
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

    // Distribute rounding remainder to the first line
    const thisLineFeePerUnit = feePerUnitCents + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder = Math.max(0, remainder - line.quantity);

    const newPrice = ((originalCents + thisLineFeePerUnit) / 100).toFixed(2);

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
