import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
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
  List,
  Box,
  Banner,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { PLANS, getPlan } from "../utils/plans";

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
  } catch { /* no active subscription */ }

  return json({ currentPlan: activePlan, plans: PLANS, isTest });
};


const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "1 pickup location",
    "Up to 50 orders / month",
    "'Ready to collect' email notifications",
    "Order management dashboard",
    "Powered by Miko badge",
  ],
  starter: [
    "Up to 3 pickup locations",
    "Up to 500 orders / month",
    "All Free features",
    "Custom SMTP (send from your domain)",
    "No Miko badge",
  ],
  growth: [
    "Unlimited pickup locations",
    "Unlimited orders",
    "All Starter features",
    "Priority support",
  ],
};

export default function PricingPage() {
  const { currentPlan, plans, isTest } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    const confirmed = window.confirm(
      "Downgrade to the Free plan? You can upgrade again any time.",
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
    <Page title="Pricing">
      {error && <Box paddingBlockEnd="400"><Banner tone="critical">{error}</Banner></Box>}

      <Layout>
        {Object.entries(plans).map(([key, plan]) => {
          const isCurrent = currentPlan === key;
          const features = PLAN_FEATURES[key] ?? [];

          return (
            <Layout.Section key={key} variant="oneThird">
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text variant="headingMd" as="h2">{plan.name}</Text>
                    {isCurrent && <Badge tone="success">Current plan</Badge>}
                  </InlineStack>

                  <Text variant="heading2xl" as="p">
                    {plan.price === 0 ? "Free" : `$${plan.price}`}
                    {plan.price > 0 && <Text as="span" variant="bodySm" tone="subdued">/month</Text>}
                  </Text>

                  {isTest && plan.price > 0 && (
                    <Text as="p" tone="subdued" variant="bodySm">Test mode - no real charge</Text>
                  )}

                  <Divider />

                  <BlockStack gap="200">
                    {features.map((f) => (
                      <InlineStack key={f} gap="200" align="start">
                        <Box><CheckIcon width={16} /></Box>
                        <Text as="p" variant="bodySm">{f}</Text>
                      </InlineStack>
                    ))}
                  </BlockStack>

                  <Divider />

                  {isCurrent ? (
                    <Button disabled fullWidth>Current plan</Button>
                  ) : key === "free" ? (
                    currentPlan === "free" ? (
                      <Button disabled fullWidth>Current plan</Button>
                    ) : (
                      <Button
                        fullWidth
                        loading={loading === "cancel"}
                        onClick={handleCancel}
                      >
                        Downgrade to Free
                      </Button>
                    )
                  ) : (
                    <Button
                      variant="primary"
                      fullWidth
                      loading={loading === key}
                      onClick={() => handleSubscribe(key)}
                    >
                      {currentPlan === "free" ? "Start 14-day free trial" : `Switch to ${plan.name}`}
                    </Button>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          );
        })}
      </Layout>
    </Page>
  );
}
