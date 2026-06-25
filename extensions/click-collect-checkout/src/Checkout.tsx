import {
  reactExtension,
  useShop,
  useSettings,
  useApplyAttributeChange,
  useApplyCartLinesChange,
  useAttributes,
  useCartLines,
  Banner,
  BlockStack,
  Checkbox,
  Select,
  Text,
  InlineStack,
  Divider,
  SkeletonText,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useEffect, useCallback, useRef } from "react";

type Location = {
  id: string;
  name: string;
  address: string;
  city: string;
  postcode: string;
  phone: string;
  prepTimeMinutes: number;
  collectionInstructions: string;
  hours: Record<string, { open: string; close: string; closed: boolean }>;
  serviceFeeType: string;
  serviceFeeAmount: number;
  serviceFeeFreeAbove: number;
  serviceFeeLabel: string;
  shopifyFeeVariantId: string;
};

type ApiResponse = {
  locations: Location[];
  serviceFeeVariantId: string;
};

const APP_URL = "https://miko-click-collect-production.up.railway.app";
const FEE_LINE_FLAG = "_miko_service_fee_line";
const FEE_AMOUNT_ATTR = "miko_fee_amount";

const TODAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

function formatPrepTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return "Next day";
}

function calculateFee(location: Location, subtotal: number): number {
  if (location.serviceFeeType === "free" || location.serviceFeeAmount <= 0) return 0;
  if (location.serviceFeeFreeAbove > 0 && subtotal >= location.serviceFeeFreeAbove) return 0;
  if (location.serviceFeeType === "percentage") {
    return Math.round((subtotal * location.serviceFeeAmount) / 100 * 100) / 100;
  }
  return location.serviceFeeAmount;
}

function formatFee(location: Location): string | null {
  if (location.serviceFeeType === "free" || location.serviceFeeAmount <= 0) return null;
  const label = location.serviceFeeLabel || "Pickup fee";
  const freeText = location.serviceFeeFreeAbove > 0
    ? ` (free on orders over $${location.serviceFeeFreeAbove})`
    : "";
  if (location.serviceFeeType === "percentage") {
    return `${label}: ${location.serviceFeeAmount}%${freeText}`;
  }
  return `${label}: $${location.serviceFeeAmount.toFixed(2)}${freeText}`;
}

function LocationCard({ location }: { location: Location }) {
  const todayHours = location.hours?.[TODAY_KEY];
  const hoursText = todayHours
    ? todayHours.closed ? "Closed today" : `Today: ${todayHours.open} - ${todayHours.close}`
    : null;
  const feeText = formatFee(location);

  return (
    <BlockStack spacing="tight">
      <Text size="medium" emphasis="bold">{location.name}</Text>
      {(location.address || location.city) && (
        <Text size="small" appearance="subdued">
          {[location.address, location.city, location.postcode].filter(Boolean).join(", ")}
        </Text>
      )}
      <InlineStack spacing="tight">
        {hoursText && <Text size="small" appearance="subdued">{hoursText}</Text>}
        <Text size="small" appearance="subdued">Ready in {formatPrepTime(location.prepTimeMinutes)}</Text>
      </InlineStack>
      {location.phone && <Text size="small" appearance="subdued">Phone: {location.phone}</Text>}
      {feeText
        ? <Text size="small" appearance="info">{feeText}</Text>
        : <Text size="small" appearance="success">Free pickup</Text>
      }
      {location.collectionInstructions && (
        <Text size="small" appearance="subdued">{location.collectionInstructions}</Text>
      )}
    </BlockStack>
  );
}

export default reactExtension("purchase.checkout.delivery-address.render-before", () => (
  <ClickCollectExtension />
));

function ClickCollectExtension() {
  const { myshopifyDomain } = useShop();
  const applyAttributeChange = useApplyAttributeChange();
  const applyCartLinesChange = useApplyCartLinesChange();
  const settings = useSettings();
  const cartAttributes = useAttributes();
  const cartLines = useCartLines();

  const heading = (settings.heading as string) || "Click & Collect";
  const description = (settings.description as string) || "Skip the wait and collect your order from one of our pickup locations.";
  const checkboxLabel = (settings.checkbox_label as string) || "I will collect my order in-store";

  // Restore the customer's previous selection from cart attributes — these persist
  // across page refreshes and even navigation away/back to the checkout for the
  // same cart, so "I picked pickup before" doesn't get forgotten.
  const existingPickupMethod = cartAttributes?.find((a) => a.key === "miko_pickup_method")?.value ?? "";
  const existingLocationId = cartAttributes?.find((a) => a.key === "miko_location_id")?.value ?? "";

  const [locations, setLocations] = useState<Location[]>([]);
  const [serviceFeeVariantId, setServiceFeeVariantId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClickCollect, setIsClickCollect] = useState(existingPickupMethod === "click_and_collect");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(existingLocationId);
  const cleanedRef = useRef(false);

  // Subtotal excluding the fee line itself — used for free-above calculation
  const subtotal = cartLines
    .filter((l) => !l.attributes?.some((a) => a.key === FEE_LINE_FLAG))
    .reduce((sum, l) => {
      const amt = parseFloat(String(l.cost?.totalAmount?.amount ?? "0"));
      return sum + (Number.isFinite(amt) ? amt : 0);
    }, 0);

  const feeLine = cartLines.find((l) =>
    l.attributes?.some((a) => a.key === FEE_LINE_FLAG && a.value === "true"),
  );
  const feeLineIdRef = useRef<string | null>(feeLine?.id ?? null);
  feeLineIdRef.current = feeLine?.id ?? null;

  useEffect(() => {
    fetch(`${APP_URL}/api/public/locations?shop=${myshopifyDomain}`)
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        const locs = data.locations ?? [];
        setLocations(locs);
        setServiceFeeVariantId(data.serviceFeeVariantId ?? "");
        // Only auto-select the first location if no previous selection exists,
        // or if the previously selected location no longer exists.
        const prevStillValid = existingLocationId && locs.some((l) => l.id === existingLocationId);
        if (!prevStillValid && locs.length > 0) {
          setSelectedLocationId(locs[0].id);
        }
      })
      .catch(() => setError("Could not load pickup locations."))
      .finally(() => setLoading(false));
  }, [myshopifyDomain]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reconcile any genuinely orphaned state on first mount.
  // "Orphaned" = inconsistent state we can't honour. We do NOT touch state that
  // reflects a deliberate customer selection — that must persist across refreshes.
  useEffect(() => {
    if (cleanedRef.current) return;
    if (loading) return;                       // wait until locations are loaded
    cleanedRef.current = true;

    const feeLines = cartLines.filter((l) =>
      l.attributes?.some((a) => a.key === FEE_LINE_FLAG && a.value === "true"),
    );

    (async () => {
      if (existingPickupMethod === "click_and_collect") {
        // Customer previously selected pickup — make sure the fee line matches
        // the current location/subtotal. Easiest correct path: re-sync as if
        // they just toggled it on now.
        const loc = locations.find((l) => l.id === selectedLocationId);
        if (loc) {
          await syncCartRef.current(true, loc.id, loc.name, loc);
        }
      } else if (feeLines.length > 0) {
        // No pickup selected but fee lines exist → orphaned. Remove them.
        for (const line of feeLines) {
          await applyCartLinesChange({ type: "removeCartLine", id: line.id, quantity: line.quantity });
        }
      }
    })();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeFeeLine = useCallback(async () => {
    if (feeLineIdRef.current) {
      await applyCartLinesChange({ type: "removeCartLine", id: feeLineIdRef.current, quantity: 1 });
      feeLineIdRef.current = null;
    }
  }, [applyCartLinesChange]);

  const syncCartRef = useRef<(enabled: boolean, locId: string, locName: string, loc?: Location) => Promise<void>>(
    async () => {},
  );

  const syncCart = useCallback(
    async (enabled: boolean, locId: string, locName: string, loc?: Location) => {
      if (enabled && loc) {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "click_and_collect" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: locId });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: locName });

        const fee = calculateFee(loc, subtotal);
        await removeFeeLine();

        if (fee > 0) {
          // Use the per-location variant whose price IS the fee — no cart_transform needed.
          // Falls back to the shared $0 base variant only if the per-location variant is missing.
          const variantId = loc.shopifyFeeVariantId || serviceFeeVariantId;
          if (variantId) {
            await applyCartLinesChange({
              type: "addCartLine",
              merchandiseId: variantId,
              quantity: 1,
              attributes: [
                { key: FEE_LINE_FLAG, value: "true" },
                { key: FEE_AMOUNT_ATTR, value: fee.toFixed(2) },
                { key: "Pickup location", value: locName },
              ],
            });
          }
        }
      } else {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: "" });
        await removeFeeLine();
      }
    },
    [applyAttributeChange, applyCartLinesChange, removeFeeLine, serviceFeeVariantId, subtotal],
  );

  // Keep the syncCart ref pointing at the latest closure so out-of-band callers
  // (mount-time reconciliation, etc.) always have the current syncCart logic.
  syncCartRef.current = syncCart;

  // Recalculate the fee whenever cart subtotal changes (customer added/removed items
  // crossing the "free above $X" threshold)
  const lastSyncedSubtotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isClickCollect) return;
    if (!selectedLocationId) return;
    const loc = locations.find((l) => l.id === selectedLocationId);
    if (!loc) return;
    if (lastSyncedSubtotalRef.current === subtotal) return;
    lastSyncedSubtotalRef.current = subtotal;
    syncCart(true, selectedLocationId, loc.name, loc);
  }, [subtotal, isClickCollect, selectedLocationId, locations, syncCart]);

  const handleToggle = useCallback(
    (checked: boolean) => {
      setIsClickCollect(checked);
      const loc = locations.find((l) => l.id === selectedLocationId);
      syncCart(checked, selectedLocationId, loc?.name ?? "", loc);
    },
    [locations, selectedLocationId, syncCart],
  );

  const handleLocationChange = useCallback(
    (value: string) => {
      setSelectedLocationId(value);
      const loc = locations.find((l) => l.id === value);
      if (isClickCollect) {
        syncCart(true, value, loc?.name ?? "", loc);
      }
    },
    [locations, isClickCollect, syncCart],
  );

  if (!loading && locations.length === 0) return null;

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <BlockStack spacing="base">
      <Divider />
      <BlockStack spacing="tight">
        <Text size="medium" emphasis="bold">{heading}</Text>
        <Text size="small" appearance="subdued">{description}</Text>
      </BlockStack>

      {loading && <SkeletonText inlineSize="fill" />}
      {error && <Banner status="warning">{error}</Banner>}

      {!loading && !error && locations.length > 0 && (
        <BlockStack spacing="base">
          <Checkbox
            id="miko-click-collect-toggle"
            checked={isClickCollect}
            onChange={handleToggle}
          >
            {checkboxLabel}
          </Checkbox>

          {isClickCollect && (
            <BlockStack spacing="base">
              {locations.length > 1 && (
                <Select
                  label="Select pickup location"
                  options={locations.map((l) => ({
                    value: l.id,
                    label: l.city ? `${l.name}, ${l.city}` : l.name,
                  }))}
                  value={selectedLocationId}
                  onChange={handleLocationChange}
                />
              )}

              {selectedLocation && (
                <BlockStack spacing="tight" padding="base" border="base" cornerRadius="base">
                  <LocationCard location={selectedLocation} />
                </BlockStack>
              )}

              <Banner status="info">
                We will email you as your order progresses. Please bring your order number or confirmation email when collecting.
              </Banner>
            </BlockStack>
          )}
        </BlockStack>
      )}

      <Divider />
    </BlockStack>
  );
}
