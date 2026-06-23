import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Button,
  Badge,
  Box,
  Divider,
  Banner,
  ProgressBar,
} from "@shopify/polaris";
import {
  LocationIcon,
  OrderIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertCircleIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlan } from "../utils/plans";
import { format } from "date-fns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [config, locationCount, orders] = await Promise.all([
    db.shopConfig.findUnique({ where: { shop } }),
    db.pickupLocation.count({ where: { shop, isActive: true } }),
    db.clickCollectOrder.findMany({
      where: { shop },
      include: { pickupLocation: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const pendingCount = await db.clickCollectOrder.count({ where: { shop, status: "pending" } });
  const readyCount = await db.clickCollectOrder.count({ where: { shop, status: "ready" } });
  const pickedUpCount = await db.clickCollectOrder.count({ where: { shop, status: "picked_up" } });

  const planName = config?.planName ?? "free";
  const plan = getPlan(planName);
  const onboardingComplete = locationCount > 0;

  return json({
    planName,
    plan,
    locationCount,
    pendingCount,
    readyCount,
    pickedUpCount,
    onboardingComplete,
    recentOrders: orders.map((o) => ({
      id: o.id,
      orderName: o.shopifyOrderName,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      locationName: o.pickupLocation.name,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
    })),
  });
};

const STATUS_BADGE: Record<string, { tone: "attention" | "success" | "info" | "critical"; label: string }> = {
  pending: { tone: "attention", label: "Pending" },
  ready: { tone: "info", label: "Ready" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" },
};

export default function DashboardPage() {
  const { planName, plan, locationCount, pendingCount, readyCount, pickedUpCount, onboardingComplete, recentOrders } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      title="Miko Click & Collect"
      subtitle="Manage in-store pickup for your Shopify store"
      primaryAction={
        pendingCount > 0
          ? { content: `View ${pendingCount} pending order${pendingCount !== 1 ? "s" : ""}`, onAction: () => navigate("/app/orders?status=pending") }
          : { content: "View all orders", onAction: () => navigate("/app/orders") }
      }
    >
      <Layout>
        {!onboardingComplete && (
          <Layout.Section>
            <Banner
              title="Set up your first pickup location"
              tone="warning"
              action={{ content: "Add location", onAction: () => navigate("/app/locations/new") }}
            >
              <p>Add at least one pickup location before customers can choose click &amp; collect at checkout.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Stats row */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Pending pickup</Text>
                  <Box><AlertCircleIcon width={20} /></Box>
                </InlineStack>
                <Text variant="heading2xl" as="p">{pendingCount}</Text>
                <Button variant="plain" onClick={() => navigate("/app/orders?status=pending")}>View pending</Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Ready to collect</Text>
                  <Box><CheckCircleIcon width={20} /></Box>
                </InlineStack>
                <Text variant="heading2xl" as="p">{readyCount}</Text>
                <Button variant="plain" onClick={() => navigate("/app/orders?status=ready")}>View ready</Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Collected today</Text>
                  <Box><OrderIcon width={20} /></Box>
                </InlineStack>
                <Text variant="heading2xl" as="p">{pickedUpCount}</Text>
                <Button variant="plain" onClick={() => navigate("/app/orders?status=picked_up")}>View history</Button>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Recent orders */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Recent orders</Text>
                <Button variant="plain" onClick={() => navigate("/app/orders")}>See all</Button>
              </InlineStack>
              <Divider />

              {recentOrders.length === 0 ? (
                <Box padding="600">
                  <BlockStack gap="200" align="center">
                    <Text as="p" tone="subdued" alignment="center">No click &amp; collect orders yet.</Text>
                    <Text as="p" tone="subdued" alignment="center">Once customers choose pickup at checkout, orders appear here.</Text>
                  </BlockStack>
                </Box>
              ) : (
                <BlockStack gap="0">
                  {recentOrders.map((order, idx) => {
                    const badge = STATUS_BADGE[order.status] ?? { tone: "attention", label: order.status };
                    return (
                      <Box key={order.id}>
                        {idx > 0 && <Divider />}
                        <Box padding="300">
                          <InlineStack align="space-between" wrap={false}>
                            <BlockStack gap="100">
                              <InlineStack gap="200" align="start">
                                <Text variant="bodyMd" fontWeight="semibold" as="span">{order.orderName}</Text>
                                <Badge tone={badge.tone}>{badge.label}</Badge>
                              </InlineStack>
                              <Text variant="bodySm" as="p" tone="subdued">
                                {order.customerName} · {order.locationName}
                              </Text>
                            </BlockStack>
                            <Button variant="plain" size="slim" onClick={() => navigate(`/app/orders/${order.id}`)}>
                              Manage
                            </Button>
                          </InlineStack>
                        </Box>
                      </Box>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Quick access */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Pickup locations</Text>
                <Text as="p" tone="subdued">{locationCount} active location{locationCount !== 1 ? "s" : ""}</Text>
                <Button onClick={() => navigate("/app/locations")}>Manage locations</Button>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Plan</Text>
                <InlineStack gap="200">
                  <Badge tone={planName === "free" ? "attention" : "success"}>{plan.name}</Badge>
                  <Text as="span" tone="subdued">${plan.price}/mo</Text>
                </InlineStack>
                <Text as="p" variant="bodySm" tone="subdued">
                  {plan.locationLimit >= 999 ? "Unlimited" : plan.locationLimit} location{plan.locationLimit !== 1 ? "s" : ""}
                </Text>
                {planName === "free" && (
                  <Button onClick={() => navigate("/app/pricing")}>Upgrade plan</Button>
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
