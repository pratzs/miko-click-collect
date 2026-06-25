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
  serviceFeeVariantId: string | null;
};

const APP_URL = "https://miko-click-collect-production.up.railway.app";
const FEE_LINE_ATTR = "_miko_service_fee_line";

const TODAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

function formatPrepTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return "Next day";
}

function formatFee(location: Location): string | null {
  if (location.serviceFeeType === "free") return null;
  const label = location.serviceFeeLabel || "Packing fee";
  if (location.serviceFeeType === "fixed") {
    const freeText = location.serviceFeeFreeAbove > 0
      ? ` (free on orders over $${location.serviceFeeFreeAbove})`
      : "";
    return `${label}: $${location.serviceFeeAmount.toFixed(2)}${freeText}`;
  }
  if (location.serviceFeeType === "percentage") {
    const freeText = location.serviceFeeFreeAbove > 0
      ? ` (free on orders over $${location.serviceFeeFreeAbove})`
      : "";
    return `${label}: ${location.serviceFeeAmount}%${freeText}`;
  }
  return null;
}

function LocationCard({ location }: { location: Location }) {
  const todayHours = location.hours?.[TODAY_KEY];
  const hoursText = todayHours
    ? todayHours.closed
      ? "Closed today"
      : `Today: ${todayHours.open} - ${todayHours.close}`
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

  // Read existing cart attribute state — persists across page loads within the same checkout session
  const existingPickupMethod = cartAttributes?.find(a => a.key === "miko_pickup_method")?.value ?? "";
  const existingLocationId = cartAttributes?.find(a => a.key === "miko_location_id")?.value ?? "";

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialise from cart attribute so the checkbox reflects the actual cart state on reload
  const [isClickCollect, setIsClickCollect] = useState(existingPickupMethod === "click_and_collect");
  const [selectedLocationId, setSelectedLocationId] = useState<string>(existingLocationId);

  // Track the fee line cart line id so we can remove it when needed
  const feeLine = cartLines.find(l =>
    l.attributes?.some(a => a.key === FEE_LINE_ATTR && a.value === "true")
  );
  const feeLineId = feeLine?.id ?? null;

  // Stable ref to avoid stale closures in callbacks
  const feeLineIdRef = useRef(feeLineId);
  feeLineIdRef.current = feeLineId;

  useEffect(() => {
    fetch(`${APP_URL}/api/public/locations?shop=${myshopifyDomain}`)
      .then((r) => r.json())
      .then((data: { locations: Location[] }) => {
        const locs: Location[] = data.locations ?? [];
        setLocations(locs);
        // If no location was previously selected, default to the first one
        if (!existingLocationId && locs.length > 0) {
          setSelectedLocationId(locs[0].id);
        }
      })
      .catch(() => setError("Could not load pickup locations."))
      .finally(() => setLoading(false));
  }, [myshopifyDomain]); // eslint-disable-line react-hooks/exhaustive-deps

  const removeFeeLineIfPresent = useCallback(async () => {
    if (feeLineIdRef.current) {
      await applyCartLinesChange({ type: "removeCartLine", id: feeLineIdRef.current, quantity: 1 });
    }
  }, [applyCartLinesChange]);

  const setAttributes = useCallback(
    async (enabled: boolean, locId: string, locName: string, loc?: Location) => {
      if (enabled) {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "click_and_collect" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: locId });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: locName });

        // Service fee
        const hasFee = loc && loc.serviceFeeType !== "free" && loc.serviceFeeAmount > 0;
        const feeAmount = hasFee ? loc!.serviceFeeAmount.toFixed(2) : "0";
        await applyAttributeChange({ type: "updateAttribute", key: "miko_service_fee", value: feeAmount });

        // Add fee as a line item if the location has a variant ID configured
        if (hasFee && loc!.serviceFeeVariantId) {
          // Remove existing fee line first to avoid duplicates
          await removeFeeLineIfPresent();
          await applyCartLinesChange({
            type: "addCartLine",
            merchandiseId: loc!.serviceFeeVariantId,
            quantity: 1,
            attributes: [{ key: FEE_LINE_ATTR, value: "true" }],
          });
        } else if (!hasFee) {
          await removeFeeLineIfPresent();
        }
      } else {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_service_fee", value: "" });
        await removeFeeLineIfPresent();
      }
    },
    [applyAttributeChange, applyCartLinesChange, removeFeeLineIfPresent],
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      setIsClickCollect(checked);
      const loc = locations.find((l) => l.id === selectedLocationId);
      setAttributes(checked, selectedLocationId, loc?.name ?? "", loc);
    },
    [locations, selectedLocationId, setAttributes],
  );

  const handleLocationChange = useCallback(
    (value: string) => {
      setSelectedLocationId(value);
      const loc = locations.find((l) => l.id === value);
      if (isClickCollect) {
        setAttributes(true, value, loc?.name ?? "", loc);
      }
    },
    [locations, isClickCollect, setAttributes],
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
