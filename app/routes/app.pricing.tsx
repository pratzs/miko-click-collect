import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Divider,
  Box,
  Banner,
  Icon,
} from "@shopify/polaris";
import { CheckIcon, EmailIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { PLANS } from "../utils/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await db.shopConfig.findUnique({ where: { shop } });
  const planName = config?.planName ?? "free";
  const isTest = process.env.SHOPIFY_BILLING_TEST !== "false";

  let activePlan = planName;
  try {
    const billingCheck = await billing.check({ plans: ["starter", "growth"], isTest });
    if (billingCheck.hasActivePayment) {
      const subName = billingCheck.appSubscriptions?.[0]?.name ?? null;
      if (subName && subName !== planName) {
        activePlan = subName;
        await db.shopConfig.update({
          where: { shop },
          data: { planName: subName },
        });
      }
    } else if (planName !== "free") {
      activePlan = "free";
      await db.shopConfig.update({
        where: { shop },
        data: { planName: "free" },
      });
    }
  } catch {}

  return json({ currentPlan: activePlan, plans: PLANS });
};

const PLAN_CARDS = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need to get started with click and collect.",
    features: [
      "1 pickup location",
      "Up to 50 orders per month",
      "Customer email notifications",
      "Order progress tracking",
      "Admin order management",
      "Miko branding on emails",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    price: "$9.95",
    period: "per month",
    popular: true,
    description: "For growing stores that need more flexibility and branding control.",
    features: [
      "Up to 3 pickup locations",
      "Up to 500 orders per month",
      "Everything in Free",
      "Send emails from your own domain (SMTP)",
      "No Miko branding",
      "Per-item status tracking",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    price: "$29.95",
    period: "per month",
    description: "For high-volume stores with multiple locations and teams.",
    features: [
      "Unlimited pickup locations",
      "Unlimited orders",
      "Everything in Starter",
      "Priority support",
      "Multi-step order workflow",
      "Analytics dashboard",
    ],
  },
];

export default function PricingPage() {
  const { currentPlan } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function openSupport() {
    const href = `mailto:hello@tripsterdevelopers.com?subject=${encodeURIComponent("Miko Click and Collect - Plan enquiry")}`;
    try {
      const top = window.top || window;
      top.location.href = href;
    } catch {
      window.open(href, "_blank");
    }
  }

  async function handleCancel() {
    const confirmed = window.confirm(
      "Switch to the Free plan? Your current features will be reduced, but you can upgrade again any time.",
    );
    if (!confirmed) return;
    setLoading("cancel");
    setError(null);
    try {
      const token = await Promise.race([
        shopify.idToken(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("This is taking a bit longer than expected. Please refresh the page and try again.")), 8000),
        ),
      ]);
      await fetch("/app/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      window.location.reload();
    } catch (e) {
      console.error("[billing] cancel failed:", e);
      setError(e instanceof Error ? e.message : "Something went wrong. Please refresh and try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleSubscribe(plan: string) {
    setLoading(plan);
    setError(null);
    try {
      const token = await Promise.race([
        shopify.idToken(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("This is taking a bit longer than expected. Please refresh the page and try again.")), 8000),
        ),
      ]);
      const res = await fetch(`/api/billing/subscribe?plan=${plan}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const reauthUrl = res.headers.get("X-Shopify-API-Request-Failure-Reauthorize-Url");
      if (reauthUrl) {
        if (window.top) window.top.location.href = reauthUrl;
        else window.location.href = reauthUrl;
      }
    } catch (e) {
      console.error("[billing] subscribe failed:", e);
      setError(e instanceof Error ? e.message : "Something went wrong. Please refresh and try again.");
    } finally {
      setLoading(null);
    }
  }

  const currentPrice = PLANS[currentPlan as keyof typeof PLANS]?.price ?? 0;

  return (
    <Page
      title="Plans and Pricing"
      subtitle="Choose the plan that best suits your business. All paid plans include a 14-day free trial."
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="600">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        {/* Plan cards grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
          }}
        >
          {PLAN_CARDS.map((plan) => {
            const isCurrent = currentPlan === plan.key;
            const isUpgrade = (PLANS[plan.key as keyof typeof PLANS]?.price ?? 0) > currentPrice;

            return (
              <div
                key={plan.key}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  background: "var(--p-color-bg-surface)",
                  borderRadius: "12px",
                  border: plan.popular && !isCurrent
                    ? "2px solid var(--p-color-border-interactive)"
                    : "1px solid var(--p-color-border)",
                  padding: "20px",
                  position: "relative",
                }}
              >
                {/* Header */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <Text as="h2" variant="headingLg">{plan.name}</Text>
                    {plan.popular && !isCurrent && <Badge tone="info">Popular</Badge>}
                    {isCurrent && <Badge tone="success">Current plan</Badge>}
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "4px" }}>
                    <Text as="p" variant="heading2xl">{plan.price}</Text>
                    {plan.key !== "free" && (
                      <Text as="span" tone="subdued">/{plan.period.replace("per ", "")}</Text>
                    )}
                  </div>

                  <Text as="p" tone="subdued" variant="bodySm">{plan.description}</Text>
                </div>

                <Divider />

                {/* Features */}
                <div style={{ flex: 1, padding: "16px 0" }}>
                  <BlockStack gap="300">
                    {plan.features.map((f) => (
                      <InlineStack key={f} gap="200" blockAlign="start" wrap={false}>
                        <Box>
                          <div style={{ color: "#2C6ECB" }}>
                            <Icon source={CheckIcon} />
                          </div>
                        </Box>
                        <Text as="p" variant="bodyMd">{f}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </div>

                <Divider />

                {/* Action button */}
                <div style={{ paddingTop: "16px" }}>
                  {isCurrent ? (
                    <Button disabled fullWidth>
                      Current plan
                    </Button>
                  ) : plan.key === "free" ? (
                    <Button
                      fullWidth
                      loading={loading === "cancel"}
                      onClick={handleCancel}
                      tone="critical"
                    >
                      Switch to Free
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      fullWidth
                      loading={loading === plan.key}
                      onClick={() => handleSubscribe(plan.key)}
                    >
                      {isUpgrade && currentPlan === "free"
                        ? "Start 14-day free trial"
                        : isUpgrade
                          ? `Upgrade to ${plan.name}`
                          : `Switch to ${plan.name}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div
          style={{
            background: "var(--p-color-bg-surface)",
            borderRadius: "12px",
            border: "1px solid var(--p-color-border)",
            padding: "20px",
          }}
        >
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Frequently asked questions</Text>
            <Divider />
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">Can I change plans at any time?</Text>
                <Text as="p" tone="subdued">Absolutely. You can upgrade, switch, or cancel whenever you like. When upgrading, you only pay the difference. When switching to a lower plan, your current billing cycle will be prorated.</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">What happens when I reach my order limit?</Text>
                <Text as="p" tone="subdued">New click and collect orders will still come through, but you will see a prompt to upgrade. Your existing orders and settings are never affected.</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">Is the 14-day trial really free?</Text>
                <Text as="p" tone="subdued">Yes, 100%. You will not be charged during the trial period. Cancel any time before the trial ends and you will not be billed at all.</Text>
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </div>

        {/* Contact support */}
        <div
          style={{
            background: "var(--p-color-bg-surface)",
            borderRadius: "12px",
            border: "1px solid var(--p-color-border)",
            padding: "20px",
          }}
        >
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h3" variant="headingSm">Need help choosing the right plan?</Text>
              <Text as="p" tone="subdued">
                Our team is happy to help you find the best fit for your store.
              </Text>
            </BlockStack>
            <Button icon={EmailIcon} onClick={openSupport}>
              Contact support
            </Button>
          </InlineStack>
        </div>
      </BlockStack>
    </Page>
  );
}
