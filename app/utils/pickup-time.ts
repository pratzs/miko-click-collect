/**
 * Mapping between our free-form preparation time and the fixed set of pickup
 * times Shopify accepts for native local pickup.
 *
 * Deliberately NOT in native-pickup.server.ts: the location form shows the
 * merchant the exact wording their customers will see at checkout, so this has
 * to be importable from a component without dragging the Admin API client into
 * the browser bundle.
 */

/** The complete set Shopify accepts. CUSTOM is deprecated and not used. */
export const PICKUP_TIME_MINUTES: Array<{ value: string; minutes: number; label: string }> = [
  { value: "ONE_HOUR", minutes: 60, label: "Usually ready in 1 hour" },
  { value: "TWO_HOURS", minutes: 120, label: "Usually ready in 2 hours" },
  { value: "FOUR_HOURS", minutes: 240, label: "Usually ready in 4 hours" },
  { value: "TWENTY_FOUR_HOURS", minutes: 1440, label: "Usually ready in 24 hours" },
  { value: "TWO_TO_FOUR_DAYS", minutes: 4320, label: "Usually ready in 2-4 days" },
  { value: "FIVE_OR_MORE_DAYS", minutes: 7200, label: "Usually ready in 5+ days" },
];

/**
 * Maps our free-form prep time to the nearest value Shopify will accept.
 *
 * Rounds UP, never down, whenever the merchant's time falls between two
 * options: telling a customer "ready in 1 hour" when the merchant said 90
 * minutes creates a person standing at a counter for a bag that isn't packed.
 * Overshooting by half an hour costs nothing.
 */
export function prepTimeToPickupTime(minutes: number): string {
  for (const option of PICKUP_TIME_MINUTES) {
    if (minutes <= option.minutes) return option.value;
  }
  return PICKUP_TIME_MINUTES[PICKUP_TIME_MINUTES.length - 1].value;
}

export function pickupTimeLabel(value: string): string {
  return PICKUP_TIME_MINUTES.find((o) => o.value === value)?.label ?? value;
}
