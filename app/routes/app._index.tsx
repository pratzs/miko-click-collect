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
} from "@shopify/polaris";
import {
  OrderIcon,
  CheckCircleIcon,
  ClockIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlan } from "../utils/plans";

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
  const totalOrderCount = pendingCount + readyCount + pickedUpCount;

  const planName = config?.planName ?? "free";
  const plan = getPlan(planName);
  const shopHandle = shop.replace(".myshopify.com", "");

  return json({
    planName,
    plan,
    shopHandle,
    locationCount,
    pendingCount,
    readyCount,
    pickedUpCount,
    totalOrderCount,
    recentOrders: orders.map((o) => ({
      id: o.id,
      orderName: o.shopifyOrderName,
      customerName: o.customerName,
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

function StepRow({
  n,
  title,
  description,
  cta,
  done,
  onAction,
}: {
  n: number;
  title: string;
  description: string;
  cta: string;
  done: boolean;
  onAction: () => void;
}) {
  return (
    <Box padding="300" background="bg-surface-secondary" borderRadius="200">
      <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
        <InlineStack gap="300" blockAlign="center" wrap={false}>
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: done ? "#10b981" : "#5C6AC4",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "13px",
              flexShrink: 0,
            }}
          >
            {done ? (
              <svg width="14" height="14" viewBox="0 0 20 20" fill="white">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            ) : n}
          </div>
          <BlockStack gap="050">
            <Text as="p" variant="bodyMd" fontWeight="semibold" tone={done ? "subdued" : undefined}>
              {title}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {description}
            </Text>
          </BlockStack>
        </InlineStack>
        {!done && (
          <Button variant="plain" onClick={onAction}>
            {cta}
          </Button>
        )}
      </InlineStack>
    </Box>
  );
}

export default function DashboardPage() {
  const { planName, plan, shopHandle, locationCount, pendingCount, readyCount, pickedUpCount, totalOrderCount, recentOrders } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const step1Done = locationCount > 0;
  const step3Done = totalOrderCount > 0;

  const openCheckoutEditor = () => {
    const url = `https://admin.shopify.com/store/${shopHandle}/settings/checkout`;
    if (window.top) window.top.location.href = url;
  };

  const openStorefront = () => {
    const url = `https://${shopHandle}.myshopify.com`;
    if (window.top) window.top.location.href = url;
  };

  // Phase 1: fresh install — nothing set up
  if (!step1Done) {
    return (
      <Page title="Welcome to Miko Click & Collect">
        <Layout>
          <Layout.Section>
            <div
              style={{
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                borderRadius: "12px",
                padding: "40px",
                marginBottom: "0",
              }}
            >
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl" fontWeight="bold">
                  <span style={{ color: "white" }}>Let&apos;s get click &amp; collect live in your store</span>
                </Text>
                <Text as="p" variant="bodyLg">
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    Customers will be able to choose in-store pickup at checkout. Takes about 5 minutes to set up.
                  </span>
                </Text>
              </BlockStack>
            </div>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Get started in 3 steps</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Complete these steps to enable click &amp; collect for your customers.
                </Text>
                <BlockStack gap="200">
                  <StepRow
                    n={1}
                    title="Add a pickup location"
                    description="Add your store address, opening hours, and how long orders take to prepare."
                    cta="Add location"
                    done={step1Done}
                    onAction={() => navigate("/app/locations/new")}
                  />
                  <StepRow
                    n={2}
                    title="Enable Click & Collect in checkout"
                    description="Open the checkout editor and add the Click & Collect block to your checkout flow."
                    cta="Open checkout editor"
                    done={false}
                    onAction={openCheckoutEditor}
                  />
                  <StepRow
                    n={3}
                    title="Place a test order"
                    description="Go through checkout yourself to confirm the pickup option appears correctly."
                    cta="View your store"
                    done={step3Done}
                    onAction={openStorefront}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Phase 2: location added, no orders yet — show next steps + dashboard
  const showNextSteps = step1Done && !step3Done;

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
        {/* Next steps nudge (shown until first order comes in) */}
        {showNextSteps && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Almost there — 2 steps left</Text>
                  <Badge tone="attention">Setup in progress</Badge>
                </InlineStack>
                <BlockStack gap="200">
                  <StepRow
                    n={1}
                    title="Add a pickup location"
                    description={`${locationCount} active location${locationCount !== 1 ? "s" : ""} configured.`}
                    cta="Manage"
                    done={true}
                    onAction={() => navigate("/app/locations")}
                  />
                  <StepRow
                    n={2}
                    title="Enable Click & Collect in checkout"
                    description="Open the checkout editor, search for Click & Collect, and add it to your checkout."
                    cta="Open checkout editor"
                    done={false}
                    onAction={openCheckoutEditor}
                  />
                  <StepRow
                    n={3}
                    title="Place a test order"
                    description="Go through checkout yourself to confirm the pickup option appears for customers."
                    cta="View your store"
                    done={step3Done}
                    onAction={openStorefront}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Stats row */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 3 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between">
                  <Text variant="headingSm" as="h3" tone="subdued">Pending pickup</Text>
                  <Box><ClockIcon width={20} /></Box>
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

        {/* Sidebar */}
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
