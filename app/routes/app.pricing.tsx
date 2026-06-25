import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { useAppBridge } from "@shopify/app-bridge-react";
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
  Banner,
  Icon,
  List,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
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

interface PlanCardProps {
  planKey: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  isCurrent: boolean;
  isPopular?: boolean;
  currentPlan: string;
  loading: string | null;
  onSubscribe: (plan: string) => void;
  onCancel: () => void;
}

function PlanCard({
  planKey,
  name,
  price,
  description,
  features,
  isCurrent,
  isPopular,
  currentPlan,
  loading,
  onSubscribe,
  onCancel,
}: PlanCardProps) {
  const isUpgrade = price > (PLANS[currentPlan as keyof typeof PLANS]?.price ?? 0);

  return (
    <Card>
      <BlockStack gap="400">
        {/* Header */}
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text as="h2" variant="headingLg">{name}</Text>
            <InlineStack gap="200">
              {isPopular && !isCurrent && <Badge tone="info">Popular</Badge>}
              {isCurrent && <Badge tone="success">Current plan</Badge>}
            </InlineStack>
          </InlineStack>

          <InlineStack gap="100" blockAlign="baseline">
            <Text as="p" variant="heading2xl">
              {price === 0 ? "Free" : `$${price}`}
            </Text>
            {price > 0 && (
              <Text as="span" tone="subdued">/month</Text>
            )}
          </InlineStack>

          <Text as="p" tone="subdued">{description}</Text>
        </BlockStack>

        <Divider />

        {/* Features */}
        <BlockStack gap="300">
          {features.map((f) => (
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

        {/* Spacer to push button to bottom */}
        <Box minHeight="0px" />

        <Divider />

        {/* Action button */}
        {isCurrent ? (
          <Button disabled fullWidth>
            Current plan
          </Button>
        ) : planKey === "free" ? (
          <Button
            fullWidth
            loading={loading === "cancel"}
            onClick={onCancel}
            tone="critical"
          >
            Downgrade to Free
          </Button>
        ) : (
          <Button
            variant="primary"
            fullWidth
            loading={loading === planKey}
            onClick={() => onSubscribe(planKey)}
          >
            {isUpgrade
              ? price > 0 && currentPlan === "free"
                ? "Start 14-day free trial"
                : `Upgrade to ${name}`
              : `Switch to ${name}`}
          </Button>
        )}
      </BlockStack>
    </Card>
  );
}

const PLAN_DETAILS: Record<string, { description: string; features: string[] }> = {
  free: {
    description: "Everything you need to get started with click & collect.",
    features: [
      "1 pickup location",
      "Up to 50 orders per month",
      "Customer email notifications",
      "Order progress tracking",
      "Admin order management",
      "Miko branding on emails",
    ],
  },
  starter: {
    description: "For growing stores that need more flexibility and control.",
    features: [
      "Up to 3 pickup locations",
      "Up to 500 orders per month",
      "Everything in Free",
      "Send emails from your own domain (SMTP)",
      "No Miko branding",
      "Per-item status tracking",
    ],
  },
  growth: {
    description: "For high-volume stores with multiple locations.",
    features: [
      "Unlimited pickup locations",
      "Unlimited orders",
      "Everything in Starter",
      "Priority support",
      "Multi-step order workflow",
      "Advanced analytics (coming soon)",
    ],
  },
};

export default function PricingPage() {
  const { currentPlan, plans } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    const confirmed = window.confirm(
      "Downgrade to the Free plan? Your current features will be reduced. You can upgrade again any time.",
    );
    if (!confirmed) return;
    setLoading("cancel");
    setError(null);
    try {
      const token = await Promise.race([
        shopify.idToken(),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("This is taking longer than expected. Please refresh the page and try again.")), 8000),
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
          setTimeout(() => rej(new Error("This is taking longer than expected. Please refresh the page and try again.")), 8000),
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

  return (
    <Page
      title="Plans & Pricing"
      subtitle="Choose the plan that best fits your business. All paid plans include a 14-day free trial."
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
    >
      <BlockStack gap="600">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", alignItems: "stretch" }}>
          {(["free", "starter", "growth"] as const).map((key) => {
            const plan = plans[key];
            const details = PLAN_DETAILS[key];
            return (
              <div key={key} style={{ display: "flex", flexDirection: "column" }}>
                <PlanCard
                  planKey={key}
                  name={plan.name}
                  price={plan.price}
                  description={details.description}
                  features={details.features}
                  isCurrent={currentPlan === key}
                  isPopular={key === "starter"}
                  currentPlan={currentPlan}
                  loading={loading}
                  onSubscribe={handleSubscribe}
                  onCancel={handleCancel}
                />
              </div>
            );
          })}
        </div>

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">Frequently asked questions</Text>
            <Divider />
            <BlockStack gap="300">
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">Can I change plans at any time?</Text>
                <Text as="p" tone="subdued">Yes. Upgrade, downgrade, or cancel whenever you like. When upgrading, you only pay the difference. When downgrading, your current billing cycle will be prorated.</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">What happens when I hit my order limit?</Text>
                <Text as="p" tone="subdued">New click & collect orders will still be created, but you will see a prompt to upgrade. Your existing orders and settings are never affected.</Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" fontWeight="semibold">Is the 14-day trial really free?</Text>
                <Text as="p" tone="subdued">Absolutely. You will not be charged during the trial period. Cancel any time before the trial ends and you will not be billed.</Text>
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
