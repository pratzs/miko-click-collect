import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Divider,
  Box,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { LocationIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlan, canAddLocation } from "../utils/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [config, locations] = await Promise.all([
    db.shopConfig.findUnique({ where: { shop } }),
    db.pickupLocation.findMany({
      where: { shop },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const planName = config?.planName ?? "free";
  const plan = getPlan(planName);
  const activeCount = locations.filter((l) => l.isActive).length;
  const canAdd = canAddLocation(planName, activeCount);

  return json({
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      city: l.city,
      phone: l.phone,
      isActive: l.isActive,
      prepTimeMinutes: l.prepTimeMinutes,
    })),
    plan,
    planName,
    activeCount,
    canAdd,
  });
};

export default function LocationsPage() {
  const { locations, plan, planName, activeCount, canAdd } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      title="Pickup Locations"
      primaryAction={{
        content: "Add location",
        disabled: !canAdd,
        onAction: () => navigate("/app/locations/new"),
      }}
    >
      <Layout>
        {!canAdd && (
          <Layout.Section>
            <Banner
              title={`You've reached the ${plan.name} plan limit of ${plan.locationLimit} location${plan.locationLimit !== 1 ? "s" : ""}`}
              tone="warning"
              action={{ content: "Upgrade plan", onAction: () => navigate("/app/pricing") }}
            >
              <p>Upgrade to add more pickup locations.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            {locations.length === 0 ? (
              <EmptyState
                heading="Add your first pickup location"
                action={{ content: "Add location", onAction: () => navigate("/app/locations/new") }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Locations are where customers can collect their orders. Add your store addresses, warehouses, or distribution points.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="0">
                {locations.map((location, idx) => (
                  <Box key={location.id}>
                    {idx > 0 && <Divider />}
                    <Box padding="400">
                      <InlineStack align="space-between" wrap={false}>
                        <InlineStack gap="400" align="start">
                          <BlockStack gap="100">
                            <InlineStack gap="200">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">{location.name}</Text>
                              <Badge tone={location.isActive ? "success" : "attention"}>
                                {location.isActive ? "Active" : "Inactive"}
                              </Badge>
                            </InlineStack>
                            {(location.address || location.city) && (
                              <Text variant="bodySm" tone="subdued" as="p">
                                {[location.address, location.city].filter(Boolean).join(", ")}
                              </Text>
                            )}
                            <Text variant="bodySm" tone="subdued" as="p">
                              Ready in {location.prepTimeMinutes < 60 ? `${location.prepTimeMinutes}min` : `${location.prepTimeMinutes / 60}hr`}
                              {location.phone ? ` · ${location.phone}` : ""}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button variant="plain" size="slim" onClick={() => navigate(`/app/locations/${location.id}`)}>
                          Edit
                        </Button>
                      </InlineStack>
                    </Box>
                  </Box>
                ))}
              </BlockStack>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
