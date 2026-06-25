const RATE_PREFIX = "Click and Collect"; // matches rate names auto-created by the app

export default function run(input) {
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
          // Show only the rate for the selected location
          const expectedName = `${RATE_PREFIX} - ${selectedLocationName}`;
          if (title !== expectedName) {
            operations.push({ hide: { deliveryOptionHandle: opt.handle } });
          }
        } else {
          // Hide all non-pickup rates when pickup is selected
          operations.push({ hide: { deliveryOptionHandle: opt.handle } });
        }
      } else {
        // Hide all pickup rates when pickup is NOT selected
        if (isPickupRate) {
          operations.push({ hide: { deliveryOptionHandle: opt.handle } });
        }
      }
    }
  }

  return { operations };
}
