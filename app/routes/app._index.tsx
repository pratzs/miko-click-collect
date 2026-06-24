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
  List,
  Icon,
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

  const hasEmailConfig = Boolean(config?.replyToEmail || config?.smtpHost);

  return json({
    planName,
    plan,
    shopHandle,
    locationCount,
    pendingCount,
    readyCount,
    pickedUpCount,
    totalOrderCount,
    hasEmailConfig,
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
    <Box padding="300" background={done ? "bg-surface-success" : "bg-surface-secondary"} borderRadius="200">
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
        <Button variant={done ? "plain" : "primary"} size="slim" onClick={onAction}>
          {done ? "Manage" : cta}
        </Button>
      </InlineStack>
    </Box>
  );
}

export default function DashboardPage() {
  const {
    planName, plan, shopHandle, locationCount,
    pendingCount, readyCount, pickedUpCount, totalOrderCount,
    hasEmailConfig, recentOrders,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const step1Done = locationCount > 0;
  const step2Done = totalOrderCount > 0;
  const step3Done = hasEmailConfig;
  const allDone = step1Done && step2Done && step3Done;
  const completedSteps = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const openCheckoutEditor = () => {
    const url = `https://admin.shopify.com/store/${shopHandle}/settings/checkout/editor`;
    if (window.top) window.top.location.href = url;
  };

  const openThemeEditor = () => {
    const url = `https://admin.shopify.com/store/${shopHandle}/themes/current/editor?previewPath=%2Fcart`;
    if (window.top) window.top.location.href = url;
  };

  const openStorefront = () => {
    const url = `https://${shopHandle}.myshopify.com`;
    if (window.top) window.top.location.href = url;
  };

  // Phase 1: fresh install -nothing set up
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
              }}
            >
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl" fontWeight="bold">
                  <span style={{ color: "white" }}>Let customers collect orders in-store</span>
                </Text>
                <Text as="p" variant="bodyLg">
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    Add in-store pickup to your checkout in minutes. Customers choose a location, you get notified, and they collect when ready.
                  </span>
                </Text>
              </BlockStack>
            </div>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Setup guide</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Complete these steps to get click &amp; collect live. Takes about 5 minutes.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <StepRow
                    n={1}
                    title="Add a pickup location"
                    description="Enter your store address, opening hours, prep time, and collection instructions."
                    cta="Add location"
                    done={false}
                    onAction={() => navigate("/app/locations/new")}
                  />
                  <StepRow
                    n={2}
                    title="Add the extension to your checkout"
                    description="Open the checkout editor and add the Click & Collect block. See the Help page for detailed steps."
                    cta="Open checkout editor"
                    done={false}
                    onAction={openCheckoutEditor}
                  />
                  <StepRow
                    n={3}
                    title="Configure email notifications"
                    description="Set your sender name and reply-to email so customers get pickup-ready notifications."
                    cta="Go to settings"
                    done={false}
                    onAction={() => navigate("/app/settings")}
                  />
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">How it works</Text>
                <List type="number">
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Customer selects pickup at checkout</Text> -they see a "Click &amp; Collect" checkbox with your locations, hours, and prep time.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Order appears in your dashboard</Text> -tagged "click-collect" in Shopify admin with the pickup location in the order notes.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">You mark it "Ready"</Text> -the customer gets an email notification to come collect their order.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Customer collects</Text> -you mark it "Collected" and the order is complete.
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Phase 2+: location exists, show onboarding steps if not all done + dashboard
  return (
    <Page
      title="Miko Click & Collect"
      subtitle="Manage in-store pickup for your Shopify store"
      primaryAction={
        pendingCount > 0
          ? { content: `View ${pendingCount} pending order${pendingCount !== 1 ? "s" : ""}`, onAction: () => navigate("/app/orders?status=pending") }
          : { content: "View all orders", onAction: () => navigate("/app/orders") }
      }
      secondaryActions={[
        { content: "Help & setup guide", onAction: () => navigate("/app/help") },
      ]}
    >
      <Layout>
        {/* Setup progress (shown until all steps are done) */}
        {!allDone && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingMd">Setup guide -{completedSteps}/3 complete</Text>
                  <Badge tone={allDone ? "success" : "attention"}>
                    {allDone ? "All done" : "Setup in progress"}
                  </Badge>
                </InlineStack>
                <BlockStack gap="200">
                  <StepRow
                    n={1}
                    title="Add a pickup location"
                    description={step1Done ? `${locationCount} active location${locationCount !== 1 ? "s" : ""} configured.` : "Enter your store address, hours, and prep time."}
                    cta={step1Done ? "Manage" : "Add location"}
                    done={step1Done}
                    onAction={() => navigate(step1Done ? "/app/locations" : "/app/locations/new")}
                  />
                  <StepRow
                    n={2}
                    title="Place a test order with click & collect"
                    description={step2Done ? `${totalOrderCount} click & collect order${totalOrderCount !== 1 ? "s" : ""} received.` : "Go through checkout and select 'I will collect my order in-store' to verify everything works."}
                    cta={step2Done ? "View orders" : "View store"}
                    done={step2Done}
                    onAction={step2Done ? () => navigate("/app/orders") : openStorefront}
                  />
                  <StepRow
                    n={3}
                    title="Configure email notifications"
                    description={step3Done ? "Email notifications are configured." : "Set sender name and reply-to email so customers get notified when orders are ready."}
                    cta={step3Done ? "Manage" : "Configure"}
                    done={step3Done}
                    onAction={() => navigate("/app/settings")}
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
                  <Text variant="headingSm" as="h3" tone="subdued">Collected</Text>
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
                    <Text as="p" tone="subdued" alignment="center">
                      Orders appear here when customers choose in-store pickup at checkout.
                    </Text>
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

            {!hasEmailConfig && (
              <Card>
                <BlockStack gap="300">
                  <Banner tone="warning" title="Email not configured">
                    <Text as="p" variant="bodySm">
                      Customers won&apos;t receive pickup-ready notifications until you set up email in Settings.
                    </Text>
                  </Banner>
                  <Button onClick={() => navigate("/app/settings")}>Configure email</Button>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
