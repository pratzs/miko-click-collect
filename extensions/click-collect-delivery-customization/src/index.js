/**
 * Click and Collect - Hide Shipping Delivery Customization
 *
 * When the customer selects in-store pickup (miko_pickup_method = "click_and_collect"),
 * hide all standard shipping delivery options so they cannot accidentally pay for shipping.
 *
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";

  if (!isPickup) {
    return { operations: [] };
  }

  // Hide every delivery option across all delivery groups
  const operations = input.deliveryGroups.flatMap((group) =>
    group.deliveryOptions.map((option) => ({
      hide: { deliveryOptionHandle: option.handle },
    }))
  );

  return { operations };
}
