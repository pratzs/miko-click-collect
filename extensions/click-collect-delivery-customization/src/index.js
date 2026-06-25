/**
 * Click and Collect - Hide Shipping Delivery Customization
 *
 * Hides all shipping options when the customer selects in-store pickup.
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";

  if (!isPickup) {
    return { operations: [] };
  }

  const operations = (input.cart.deliveryGroups ?? []).flatMap((group) =>
    group.deliveryOptions.map((option) => ({
      hide: { deliveryOptionHandle: option.handle },
    }))
  );

  return { operations };
}
