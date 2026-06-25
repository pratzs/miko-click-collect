const PICKUP_KEYWORDS = /pickup|collect|in.?store|local/i;

export default function run(input) {
  const isPickup = input.cart.pickupMethod?.value === "click_and_collect";
  if (!isPickup) return { operations: [] };

  const allGroups = input.cart.deliveryGroups ?? [];

  // Only hide non-pickup options when there IS a pickup-friendly $0 rate configured.
  // If no such rate exists, return empty operations so checkout doesn't error.
  const hasPickupRate = allGroups.some((group) =>
    group.deliveryOptions.some((opt) => PICKUP_KEYWORDS.test(opt.title ?? ""))
  );

  if (!hasPickupRate) {
    return { operations: [] };
  }

  const operations = allGroups.flatMap((group) =>
    group.deliveryOptions
      .filter((opt) => !PICKUP_KEYWORDS.test(opt.title ?? ""))
      .map((opt) => ({ hide: { deliveryOptionHandle: opt.handle } }))
  );

  return { operations };
}
