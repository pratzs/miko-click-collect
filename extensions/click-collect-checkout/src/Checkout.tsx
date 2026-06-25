import {
  reactExtension,
  useShop,
  useSettings,
  useApplyAttributeChange,
  useAttributes,
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
};

type ApiResponse = {
  locations: Location[];
};

const APP_URL = "https://miko-click-collect-production.up.railway.app";

const TODAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

function formatPrepTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return "Next day";
}

function formatFee(location: Location): string | null {
  if (location.serviceFeeType === "free" || location.serviceFeeAmount <= 0) return null;
  const label = location.serviceFeeLabel || "Pickup fee";
  if (location.serviceFeeType === "percentage") {
    return `${label}: ${location.serviceFeeAmount}% of order`;
  }
  return `${label}: $${location.serviceFeeAmount.toFixed(2)}`;
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
        ? <Text size="small" appearance="info">{feeText} (added to shipping)</Text>
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
  const settings = useSettings();
  const cartAttributes = useAttributes();

  const heading = (settings.heading as string) || "Click & Collect";
  const description = (settings.description as string) || "Skip the wait and collect your order from one of our pickup locations.";
  const checkboxLabel = (settings.checkbox_label as string) || "I will collect my order in-store";

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Always default to unchecked; customer actively opts in each checkout
  const [isClickCollect, setIsClickCollect] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");
  const cleanedRef = useRef(false);

  useEffect(() => {
    fetch(`${APP_URL}/api/public/locations?shop=${myshopifyDomain}`)
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        const locs = data.locations ?? [];
        setLocations(locs);
        if (locs.length > 0) setSelectedLocationId(locs[0].id);
      })
      .catch(() => setError("Could not load pickup locations."))
      .finally(() => setLoading(false));
  }, [myshopifyDomain]);

  // On first mount, clear any stale pickup state left over from a previous checkout session
  useEffect(() => {
    if (cleanedRef.current) return;
    cleanedRef.current = true;
    const hasStale = cartAttributes?.some(
      (a) => a.key.startsWith("miko_") && a.value,
    );
    if (hasStale) {
      (async () => {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: "" });
      })();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncAttributes = useCallback(
    async (enabled: boolean, locId: string, locName: string) => {
      if (enabled) {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "click_and_collect" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: locId });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: locName });
      } else {
        await applyAttributeChange({ type: "updateAttribute", key: "miko_pickup_method", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_id", value: "" });
        await applyAttributeChange({ type: "updateAttribute", key: "miko_location_name", value: "" });
      }
    },
    [applyAttributeChange],
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      setIsClickCollect(checked);
      const loc = locations.find((l) => l.id === selectedLocationId);
      syncAttributes(checked, selectedLocationId, loc?.name ?? "");
    },
    [locations, selectedLocationId, syncAttributes],
  );

  const handleLocationChange = useCallback(
    (value: string) => {
      setSelectedLocationId(value);
      const loc = locations.find((l) => l.id === value);
      if (isClickCollect) {
        syncAttributes(true, value, loc?.name ?? "");
      }
    },
    [locations, isClickCollect, syncAttributes],
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
