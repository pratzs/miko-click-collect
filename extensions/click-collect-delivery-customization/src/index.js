const PICKUP_KEYWORDS = /pickup|collect|in.?store|local/i;

export default function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";
  const allGroups = input.cart.deliveryGroups ?? [];

  if (isPickup) {
    // Pickup selected: keep only the free pickup rate, hide all paid shipping rates.
    // If no pickup rate exists yet, show everything (graceful degradation).
    const hasPickupRate = allGroups.some((group) =>
      group.deliveryOptions.some((opt) => PICKUP_KEYWORDS.test(opt.title ?? ""))
    );
    if (!hasPickupRate) return { operations: [] };

    const operations = allGroups.flatMap((group) =>
      group.deliveryOptions
        .filter((opt) => !PICKUP_KEYWORDS.test(opt.title ?? ""))
        .map((opt) => ({ hide: { deliveryOptionHandle: opt.handle } }))
    );
    return { operations };
  } else {
    // Normal shipping: hide the pickup-only rate so it never shows for regular orders.
    const operations = allGroups.flatMap((group) =>
      group.deliveryOptions
        .filter((opt) => PICKUP_KEYWORDS.test(opt.title ?? ""))
        .map((opt) => ({ hide: { deliveryOptionHandle: opt.handle } }))
    );
    return { operations };
  }
}
