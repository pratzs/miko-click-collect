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
import { DEV_STORE_PLAN } from "../dev-store.server";
import { reconcilePlan } from "../utils/billing.server";
import { checkPickupVisibility, themeEditorProductUrl } from "../utils/storefront-visibility.server";
import { runAutoSetup } from "../utils/auto-setup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  // Shopify sends the merchant back here with ?plan_handle=... straight after
  // they pick a plan on the hosted pricing page. app.tsx reconciles too, but
  // Remix runs parent and child loaders in PARALLEL, so on this one render its
  // write is not yet visible here — the merchant would land on the dashboard
  // still showing the plan they just left. Reconciling here as well costs one
  // extra call, and only on the return-from-purchase load.
  const justChangedPlan = new URL(request.url).searchParams.has("plan_handle");
  if (justChangedPlan) {
    const existing = await db.shopConfig.findUnique({ where: { shop } });
    if (existing) {
      await reconcilePlan(admin, shop, {
        currentPlan: existing.planName,
        isDevelopmentStore: existing.isDevelopmentStore,
        devStorePlan: DEV_STORE_PLAN,
      });
    }
  }

  // Run setup from the DASHBOARD too, not just Settings. This is the first
  // screen a merchant sees, and if setup has not run they land on an empty app
  // and have to go and build it by hand — which is the step that loses them.
  const pre = await db.shopConfig.findUnique({ where: { shop } });
  if (pre && (!pre.setupCompletedAt || pre.setupError)) {
    await runAutoSetup(shop, session.accessToken ?? "").catch((err) =>
      console.error("[dashboard] setup failed:", err),
    );
  }

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

  const activeCount = await db.clickCollectOrder.count({
    where: { shop, status: { in: ["confirmed", "pending", "processing", "packing"] } },
  });
  const readyCount = await db.clickCollectOrder.count({ where: { shop, status: "ready" } });
  const pickedUpCount = await db.clickCollectOrder.count({ where: { shop, status: "picked_up" } });
  const totalOrderCount = activeCount + readyCount + pickedUpCount;
  const pendingCount = activeCount;

  const planName = config?.planName ?? "free";
  const plan = getPlan(planName);
  const shopHandle = shop.replace(".myshopify.com", "");

  const hasEmailConfig = Boolean(
    (config?.replyToEmail || config?.smtpHost) && (process.env.RESEND_API_KEY || config?.smtpHost)
  );

  // Checkout can be working perfectly while every product page stays silent
  // about pickup, because whether Shopify's "Pickup available at ..." block
  // renders is a THEME setting and some themes ship with it off. That is the
  // difference between a shopper knowing pickup exists and never finding out.
  const pickupVisibility = locationCount > 0
    ? await checkPickupVisibility(shop, session.accessToken ?? "")
    : ({ state: "unknown" } as const);
  const themeEditorUrl =
    pickupVisibility.state === "hidden" ? themeEditorProductUrl(shop, pickupVisibility.themeId) : null;

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
    pickupVisibility,
    themeEditorUrl,
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

const STATUS_BADGE: Record<string, { tone: "attention" | "success" | "info" | "critical" | "warning"; label: string }> = {
  confirmed: { tone: "attention", label: "Confirmed" },
  pending: { tone: "attention", label: "Confirmed" },
  processing: { tone: "warning", label: "Processing" },
  packing: { tone: "info", label: "Packing" },
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
    hasEmailConfig, pickupVisibility, themeEditorUrl, recentOrders,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const step1Done = locationCount > 0;
  const step2Done = totalOrderCount > 0;
  const step3Done = hasEmailConfig;
  const allDone = step1Done && step2Done && step3Done;
  const completedSteps = [step1Done, step2Done, step3Done].filter(Boolean).length;

  const openStorefront = () => {
    const url = `https://${shopHandle}.myshopify.com`;
    if (window.top) window.top.location.href = url;
  };

  // Phase 1: the app could not set itself up. The only honest reason left is
  // that the store has no location that fulfills online orders, because setup
  // imports them automatically. So this screen names that, rather than handing
  // the merchant a setup checklist for work the app already does.
  if (!step1Done) {
    return (
      <Page title="Miko Click and Collect">
        <Layout>
          <Layout.Section>
            <div
              style={{
                background: "linear-gradient(135deg, #1a2e05 0%, #3f6212 55%, #65a30d 100%)",
                borderRadius: "12px",
                padding: "40px",
              }}
            >
              <BlockStack gap="400">
                <Text as="h2" variant="headingXl" fontWeight="bold">
                  <span style={{ color: "white" }}>Let shoppers collect in store</span>
                </Text>
                <Text as="p" variant="bodyLg">
                  <span style={{ color: "rgba(255,255,255,0.85)" }}>
                    We set this up from your own store locations. We could not find one yet.
                  </span>
                </Text>
              </BlockStack>
            </div>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="warning" title="No location can fulfill online orders">
                  <BlockStack gap="200">
                    <Text as="p">
                      Pickup is offered per store location, so there needs to be at least one
                      with &quot;Fulfill online orders from this location&quot; turned on, and a
                      street address so Shopify can place it on a map for nearby shoppers.
                    </Text>
                    <Text as="p">
                      Set that up in Settings, then Locations. Come back here and we will import
                      it and switch pickup on for you.
                    </Text>
                  </BlockStack>
                </Banner>
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    onClick={() => {
                      const url = `https://admin.shopify.com/store/${shopHandle}/settings/locations`;
                      if (window.top) window.top.location.href = url;
                    }}
                  >
                    Open your locations
                  </Button>
                  <Button onClick={() => navigate("/app/locations")}>Add one by hand</Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">What happens once a location is there</Text>
                <List type="number">
                  <List.Item>
                    <Text as="span" fontWeight="semibold">We switch pickup on</Text> for each of
                    your locations, so shoppers see it on your product pages and at checkout.
                    Nothing is added to your theme and no products are created.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">The shopper picks a store</Text> at
                    checkout and sees how long it takes you to have it ready.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">The order lands here</Text> tagged
                    click-collect, with the pickup location on the order.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">You mark it ready</Text> and the
                    shopper is emailed where to go and what to bring. Mark it collected when
                    they have it.
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
      title="Miko Click and Collect"
      subtitle="Manage in-store pickup for your Shopify store"
      primaryAction={
        pendingCount > 0
          ? { content: `View ${pendingCount} pending order${pendingCount !== 1 ? "s" : ""}`, onAction: () => navigate("/app/orders?status=pending") }
          : { content: "View all orders", onAction: () => navigate("/app/orders") }
      }
      secondaryActions={[
        { content: "Help and setup guide", onAction: () => navigate("/app/help") },
      ]}
    >
      <Layout>
        {pickupVisibility.state === "hidden" && themeEditorUrl && (
          <Layout.Section>
            <Banner
              tone="warning"
              title="Your product pages don't mention pickup"
              action={{
                content: "Open my product page settings",
                onAction: () => {
                  if (window.top) window.top.location.href = themeEditorUrl;
                },
              }}
            >
              <BlockStack gap="200">
                <Text as="p">
                  Pickup works at checkout, but shoppers browsing your products never see it
                  offered, and that is where they decide. Your theme ({pickupVisibility.themeName})
                  ships with Shopify&apos;s pickup block switched off.
                </Text>
                <Text as="p">
                  Shopify does not let apps change theme settings, so this one is yours to tick.
                  The button opens your product template: select the <b>buy buttons</b> block and
                  turn on <b>Pickup availability</b>. Every product page then shows
                  &quot;Pickup available at your store&quot; with your preparation time.
                </Text>
              </BlockStack>
            </Banner>
          </Layout.Section>
        )}

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
                    title="Place a test order with click and collect"
                    description={step2Done ? `${totalOrderCount} click and collect order${totalOrderCount !== 1 ? "s" : ""} received.` : "Go through checkout and select 'I will collect my order in-store' to verify everything works."}
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
                  <Text variant="headingSm" as="h3" tone="subdued">Active orders</Text>
                  <Box><ClockIcon width={20} /></Box>
                </InlineStack>
                <Text variant="heading2xl" as="p">{pendingCount}</Text>
                <Button variant="plain" onClick={() => navigate("/app/orders?status=active")}>View active</Button>
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
                    <Text as="p" tone="subdued" alignment="center">No click and collect orders yet.</Text>
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

            {planName === "growth" && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Analytics</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    View order trends, collection times, and location performance.
                  </Text>
                  <Button onClick={() => navigate("/app/analytics")}>View analytics</Button>
                </BlockStack>
              </Card>
            )}

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
