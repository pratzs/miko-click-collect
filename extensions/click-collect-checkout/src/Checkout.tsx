import {
  reactExtension,
  useShop,
  useApplyAttributeChange,
  useAttributes,
  useSettings,
  Banner,
  BlockStack,
  Checkbox,
  Select,
  Text,
  InlineStack,
  Icon,
  Divider,
  SkeletonText,
  Badge,
} from "@shopify/ui-extensions-react/checkout";
import { useState, useEffect, useCallback } from "react";

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
};

const DAY_NAMES: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const TODAY_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

function formatPrepTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes === 60) return "1 hour";
  if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
  return "Next day";
}

function LocationCard({ location }: { location: Location }) {
  const todayHours = location.hours?.[TODAY_KEY];
  const hoursText = todayHours
    ? todayHours.closed
      ? "Closed today"
      : `Today: ${todayHours.open} – ${todayHours.close}`
    : null;

  return (
    <BlockStack spacing="tight">
      <Text size="medium" emphasis="bold">{location.name}</Text>
      {(location.address || location.city) && (
        <Text size="small" appearance="subdued">
          {[location.address, location.city, location.postcode].filter(Boolean).join(", ")}
        </Text>
      )}
      <InlineStack spacing="tight">
        {hoursText && (
          <Text size="small" appearance="subdued">{hoursText}</Text>
        )}
        <Text size="small" appearance="subdued">
          · Ready in {formatPrepTime(location.prepTimeMinutes)}
        </Text>
      </InlineStack>
      {location.phone && (
        <Text size="small" appearance="subdued">📞 {location.phone}</Text>
      )}
      {location.collectionInstructions && (
        <Text size="small" appearance="info">{location.collectionInstructions}</Text>
      )}
    </BlockStack>
  );
}

export default reactExtension("purchase.checkout.block.render", () => (
  <ClickCollectExtension />
));

function ClickCollectExtension() {
  const { myshopifyDomain } = useShop();
  const settings = useSettings();
  const applyAttribute = useApplyAttributeChange();
  const attributes = useAttributes();

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClickCollect, setIsClickCollect] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("");

  // Restore previous selection from order attributes
  useEffect(() => {
    const existingMethod = attributes.find((a) => a.key === "miko_pickup_method")?.value;
    const existingLocationId = attributes.find((a) => a.key === "miko_location_id")?.value;
    if (existingMethod === "click_and_collect") {
      setIsClickCollect(true);
      if (existingLocationId) setSelectedLocationId(existingLocationId);
    }
  }, []);

  // Fetch locations from the app's public API
  useEffect(() => {
    const appUrl = (settings.app_url as string) || "";
    if (!appUrl) {
      setLoading(false);
      return;
    }

    fetch(`${appUrl}/api/public/locations?shop=${myshopifyDomain}`)
      .then((r) => r.json())
      .then((data: { locations: Location[] }) => {
        setLocations(data.locations ?? []);
        if (data.locations?.length > 0 && !selectedLocationId) {
          setSelectedLocationId(data.locations[0].id);
        }
      })
      .catch(() => setError("Could not load pickup locations."))
      .finally(() => setLoading(false));
  }, [myshopifyDomain, settings.app_url]);

  const handleToggle = useCallback(
    async (checked: boolean) => {
      setIsClickCollect(checked);
      if (!checked) {
        // Clear attributes
        await applyAttribute({ type: "updateAttribute", key: "miko_pickup_method", value: "" });
        await applyAttribute({ type: "updateAttribute", key: "miko_location_id", value: "" });
        await applyAttribute({ type: "updateAttribute", key: "miko_location_name", value: "" });
      } else if (selectedLocationId) {
        const loc = locations.find((l) => l.id === selectedLocationId);
        await applyAttribute({ type: "updateAttribute", key: "miko_pickup_method", value: "click_and_collect" });
        await applyAttribute({ type: "updateAttribute", key: "miko_location_id", value: selectedLocationId });
        await applyAttribute({ type: "updateAttribute", key: "miko_location_name", value: loc?.name ?? "" });
      }
    },
    [applyAttribute, selectedLocationId, locations],
  );

  const handleLocationChange = useCallback(
    async (value: string) => {
      setSelectedLocationId(value);
      const loc = locations.find((l) => l.id === value);
      if (isClickCollect) {
        await applyAttribute({ type: "updateAttribute", key: "miko_location_id", value });
        await applyAttribute({ type: "updateAttribute", key: "miko_location_name", value: loc?.name ?? "" });
      }
    },
    [applyAttribute, isClickCollect, locations],
  );

  // Don't render if no locations configured
  if (!loading && locations.length === 0) return null;

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <BlockStack spacing="base">
      <Divider />

      <BlockStack spacing="tight">
        <Text size="medium" emphasis="bold">🛍️ Click &amp; Collect</Text>
        <Text size="small" appearance="subdued">
          Skip the wait — collect your order from one of our pickup locations.
        </Text>
      </BlockStack>

      {loading && <SkeletonText inlineSize="fill" />}

      {error && (
        <Banner status="warning">{error}</Banner>
      )}

      {!loading && !error && locations.length > 0 && (
        <BlockStack spacing="base">
          <Checkbox
            id="miko-click-collect-toggle"
            checked={isClickCollect}
            onChange={handleToggle}
          >
            I'll collect my order in-store (free pickup)
          </Checkbox>

          {isClickCollect && (
            <BlockStack spacing="base">
              {locations.length > 1 ? (
                <Select
                  label="Select pickup location"
                  options={locations.map((l) => ({
                    value: l.id,
                    label: `${l.name}${l.city ? ` — ${l.city}` : ""}`,
                  }))}
                  value={selectedLocationId}
                  onChange={handleLocationChange}
                />
              ) : null}

              {selectedLocation && (
                <BlockStack spacing="tight" padding="base" border="base" cornerRadius="base">
                  <LocationCard location={selectedLocation} />
                </BlockStack>
              )}

              <Banner status="info">
                You'll receive an email when your order is ready to collect. Bring your order
                number or confirmation email.
              </Banner>
            </BlockStack>
          )}
        </BlockStack>
      )}

      <Divider />
    </BlockStack>
  );
}
