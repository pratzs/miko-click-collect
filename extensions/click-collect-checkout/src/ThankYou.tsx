import {
  reactExtension,
  useAttributes,
  Banner,
  BlockStack,
  Text,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.thank-you.block.render", () => (
  <ThankYouPickupBanner />
));

function ThankYouPickupBanner() {
  const attributes = useAttributes();

  const pickup = attributes.find((a) => a.key === "miko_pickup_method")?.value;
  const locationName = attributes.find((a) => a.key === "miko_location_name")?.value;

  if (pickup !== "click_and_collect" || !locationName) return null;

  return (
    <BlockStack spacing="base">
      <Banner status="info" title="In-store pickup confirmed">
        <BlockStack spacing="tight">
          <Text size="medium" emphasis="bold">
            Pickup location: {locationName}
          </Text>
          <Text size="small" appearance="subdued">
            We will email you when your order is ready to collect. Please bring your order confirmation or order number.
          </Text>
        </BlockStack>
      </Banner>
    </BlockStack>
  );
}
