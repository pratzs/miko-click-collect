import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
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

  let activeSubscription: string | null = null;
  try {
    const billingCheck = await billing.check({ plans: ["starter", "growth"], isTest });
    if (billingCheck.hasActivePayment) {
      activeSubscription = billingCheck.appSubscriptions?.[0]?.name ?? null;
    }
  } catch { /* no active subscription */ }

  return json({ currentPlan: planName, activeSubscription, plans: PLANS, isTest });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return json({ ok: true });
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

  async function handleSubscribe(plan: string) {
    setLoading(plan);
    setError(null);
    try {
      const token = await Promise.race([
        shopify.idToken(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Timeout")), 8000)),
      ]);
      const res = await fetch(`/api/billing/subscribe?plan=${plan}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { confirmationUrl?: string; error?: string };
      if (data.confirmationUrl) {
        open(data.confirmationUrl, "_top");
      } else {
        setError(data.error ?? "Something went wrong.");
      }
    } catch (e) {
      setError(String(e));
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
                    <Button fullWidth disabled>Downgrade</Button>
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
