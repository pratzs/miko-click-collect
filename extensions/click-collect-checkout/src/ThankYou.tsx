import {
  reactExtension,
  useAttributes,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Divider,
  View,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.thank-you.block.render", () => (
  <ThankYouPickupBanner />
));

const STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "packing", label: "Packing" },
  { key: "ready", label: "Ready" },
  { key: "collected", label: "Collected" },
];

function ProgressStep({ label, active, completed }: { label: string; active: boolean; completed: boolean }) {
  return (
    <BlockStack spacing="extraTight" inlineAlignment="center">
      <View
        border={completed || active ? undefined : "base"}
        cornerRadius="fullyRounded"
        padding="extraTight"
        inlineAlignment="center"
        blockAlignment="center"
      >
        <Text
          size="small"
          emphasis={active ? "bold" : undefined}
          appearance={completed || active ? undefined : "subdued"}
        >
          {completed ? "✓" : active ? "●" : "○"}
        </Text>
      </View>
      <Text
        size="extraSmall"
        emphasis={active ? "bold" : undefined}
        appearance={completed || active ? undefined : "subdued"}
      >
        {label}
      </Text>
    </BlockStack>
  );
}

function ThankYouPickupBanner() {
  const attributes = useAttributes();

  const pickup = attributes.find((a) => a.key === "miko_pickup_method")?.value;
  const locationName = attributes.find((a) => a.key === "miko_location_name")?.value;

  if (pickup !== "click_and_collect" || !locationName) return null;

  return (
    <BlockStack spacing="base">
      <Banner status="info" title="In-store pickup confirmed">
        <BlockStack spacing="base">
          <Text size="medium" emphasis="bold">
            Collect from: {locationName}
          </Text>

          {/* Progress steps */}
          <Divider />
          <InlineStack spacing="loose" inlineAlignment="center">
            {STEPS.map((step, i) => (
              <ProgressStep
                key={step.key}
                label={step.label}
                active={i === 0}
                completed={false}
              />
            ))}
          </InlineStack>
          <Divider />

          <Text size="small" appearance="subdued">
            We will email you as your order progresses through each step. Please bring your order confirmation when collecting.
          </Text>
        </BlockStack>
      </Banner>
    </BlockStack>
  );
}
