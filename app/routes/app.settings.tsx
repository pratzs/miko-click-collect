import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  InlineStack,
  Text,
  Button,
  TextField,
  Banner,
  Divider,
  Box,
  Select,
  Checkbox,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { hasSmtp } from "../utils/plans";
import { useAppBridge } from "@shopify/app-bridge-react";

import { runAutoSetup } from "../utils/auto-setup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  let config = await db.shopConfig.findUnique({ where: { shop } });

  // Auto-run setup silently if it hasn't completed yet — keeps things working after deploys
  if (config && (!config.setupCompletedAt || config.setupError)) {
    await runAutoSetup(shop, session.accessToken ?? "").catch(() => null);
    config = await db.shopConfig.findUnique({ where: { shop } });
  }

  return json({
    planName: config?.planName ?? "free",
    senderName: config?.senderName ?? "",
    replyToEmail: config?.replyToEmail ?? "",
    notifyReadySubject: config?.notifyReadySubject ?? "Your order is ready for collection",
    notifyPickedUpSubject: config?.notifyPickedUpSubject ?? "Thanks for collecting your order!",
    notifyMerchantEmail: config?.notifyMerchantEmail ?? "",
    smtpHost: config?.smtpHost ?? "",
    smtpPort: String(config?.smtpPort ?? 587),
    smtpUser: config?.smtpUser ?? "",
    smtpFromEmail: config?.smtpFromEmail ?? "",
    smtpFromName: config?.smtpFromName ?? "",
    smtpSecure: config?.smtpSecure ?? false,
    brandLogoUrl: config?.brandLogoUrl ?? "",
    brandPrimaryColor: config?.brandPrimaryColor ?? "#1a1a1a",
    brandName: config?.brandName ?? "",
    useProcessingStep: config?.useProcessingStep ?? true,
    usePackingStep: config?.usePackingStep ?? true,
    setup: {
      completed: !!config?.setupCompletedAt,
      error: config?.setupError ?? "",
      deliveryCustomizationId: config?.deliveryCustomizationId ?? "",
      locationCount: await db.pickupLocation.count({ where: { shop, isActive: true } }),
      ratedLocationCount: await db.pickupLocation.count({
        where: { shop, isActive: true, NOT: { shopifyRateId: "" } },
      }),
    },
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const form = await request.formData();

  await db.shopConfig.update({
    where: { shop },
    data: {
      senderName: form.get("senderName") as string,
      replyToEmail: form.get("replyToEmail") as string,
      notifyReadySubject: form.get("notifyReadySubject") as string,
      notifyPickedUpSubject: form.get("notifyPickedUpSubject") as string,
      notifyMerchantEmail: form.get("notifyMerchantEmail") as string,
      smtpHost: form.get("smtpHost") as string,
      smtpPort: parseInt(form.get("smtpPort") as string) || 587,
      smtpUser: form.get("smtpUser") as string,
      smtpPass: form.get("smtpPass") as string || undefined,
      smtpFromEmail: form.get("smtpFromEmail") as string,
      smtpFromName: form.get("smtpFromName") as string,
      smtpSecure: form.get("smtpSecure") === "true",
      brandLogoUrl: form.get("brandLogoUrl") as string || null,
      brandPrimaryColor: form.get("brandPrimaryColor") as string,
      brandName: form.get("brandName") as string,
      useProcessingStep: form.get("useProcessingStep") === "true",
      usePackingStep: form.get("usePackingStep") === "true",
    },
  });

  return json({ ok: true, message: "Settings saved!" });
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; message?: string }>();
  const shopify = useAppBridge();
  const [setup, setSetup] = useState(data.setup);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  async function reRunSetup() {
    setSetupLoading(true);
    setSetupMsg(null);
    try {
      const token = await shopify.idToken();
      const res = await fetch("/api/run-setup", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.ok) {
        setSetup({
          ...setup,
          completed: true,
          error: "",
        });
        setSetupMsg({ ok: true, msg: "Setup re-run successfully. Everything is wired up." });
      } else {
        const errs = Object.entries(result.steps ?? {})
          .filter(([, v]: [string, any]) => !v.ok)
          .map(([k, v]: [string, any]) => `${k}: ${v.error}`)
          .join("; ");
        setSetupMsg({ ok: false, msg: errs || "Setup failed. Please contact support." });
      }
    } catch (e) {
      setSetupMsg({ ok: false, msg: `Error: ${e instanceof Error ? e.message : String(e)}` });
    }
    setSetupLoading(false);
  }

  const [senderName, setSenderName] = useState(data.senderName);
  const [replyToEmail, setReplyToEmail] = useState(data.replyToEmail);
  const [notifyReadySubject, setNotifyReadySubject] = useState(data.notifyReadySubject);
  const [notifyPickedUpSubject, setNotifyPickedUpSubject] = useState(data.notifyPickedUpSubject);
  const [notifyMerchantEmail, setNotifyMerchantEmail] = useState(data.notifyMerchantEmail);
  const [smtpHost, setSmtpHost] = useState(data.smtpHost);
  const [smtpPort, setSmtpPort] = useState(data.smtpPort);
  const [smtpUser, setSmtpUser] = useState(data.smtpUser);
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState(data.smtpFromEmail);
  const [smtpFromName, setSmtpFromName] = useState(data.smtpFromName);
  const [brandLogoUrl, setBrandLogoUrl] = useState(data.brandLogoUrl);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(data.brandPrimaryColor);
  const [brandName, setBrandName] = useState(data.brandName);
  const [useProcessingStep, setUseProcessingStep] = useState(data.useProcessingStep);
  const [usePackingStep, setUsePackingStep] = useState(data.usePackingStep);

  const canUseSmtp = hasSmtp(data.planName);
  const isSubmitting = fetcher.state !== "idle";

  function save() {
    const fd = new FormData();
    fd.set("senderName", senderName);
    fd.set("replyToEmail", replyToEmail);
    fd.set("notifyReadySubject", notifyReadySubject);
    fd.set("notifyPickedUpSubject", notifyPickedUpSubject);
    fd.set("notifyMerchantEmail", notifyMerchantEmail);
    fd.set("smtpHost", smtpHost);
    fd.set("smtpPort", smtpPort);
    fd.set("smtpUser", smtpUser);
    if (smtpPass) fd.set("smtpPass", smtpPass);
    fd.set("smtpFromEmail", smtpFromEmail);
    fd.set("smtpFromName", smtpFromName);
    fd.set("brandLogoUrl", brandLogoUrl);
    fd.set("brandPrimaryColor", brandPrimaryColor);
    fd.set("brandName", brandName);
    fd.set("useProcessingStep", String(useProcessingStep));
    fd.set("usePackingStep", String(usePackingStep));
    fetcher.submit(fd, { method: "POST" });
  }

  return (
    <Page title="Settings" primaryAction={{ content: "Save settings", onAction: save, loading: isSubmitting }}>
      {fetcher.data?.message && (
        <Box paddingBlockEnd="400">
          <Banner tone={fetcher.data.ok ? "success" : "critical"}>{fetcher.data.message}</Banner>
        </Box>
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Order progress steps</Text>
              <Text as="p" tone="subdued">
                Choose which progress steps to show customers. The flow always starts at "Confirmed" and ends at "Ready to collect" then "Collected". Toggle the intermediate steps to match your workflow.
              </Text>
              <BlockStack gap="200">
                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodySm" as="p">Confirmed (always shown)</Text>
                </Box>
                <Checkbox
                  label="Processing step"
                  helpText="Show when your team starts working on the order."
                  checked={useProcessingStep}
                  onChange={setUseProcessingStep}
                />
                <Checkbox
                  label="Packing step"
                  helpText="Show when the order is being packed for collection."
                  checked={usePackingStep}
                  onChange={setUsePackingStep}
                />
                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodySm" as="p">Ready to collect (always shown)</Text>
                </Box>
                <Box padding="200" background="bg-surface-secondary" borderRadius="200">
                  <Text variant="bodySm" as="p">Collected (always shown)</Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Email notifications</Text>
              <Text as="p" tone="subdued">
                Emails are sent to customers when their order is ready to collect and after pickup.
              </Text>
              <InlineGrid columns={2} gap="400">
                <TextField label="Sender name" value={senderName} onChange={setSenderName} autoComplete="off" placeholder="Acme Store" />
                <TextField label="Reply-to email" value={replyToEmail} onChange={setReplyToEmail} autoComplete="off" type="email" placeholder="hello@acme.co.nz" />
              </InlineGrid>
              <TextField
                label="'Ready to collect' subject line"
                value={notifyReadySubject}
                onChange={setNotifyReadySubject}
                autoComplete="off"
              />
              <TextField
                label="'Picked up' subject line"
                value={notifyPickedUpSubject}
                onChange={setNotifyPickedUpSubject}
                autoComplete="off"
              />
              <TextField
                label="BCC merchant email"
                value={notifyMerchantEmail}
                onChange={setNotifyMerchantEmail}
                autoComplete="off"
                type="email"
                placeholder="owner@acme.co.nz"
                helpText="Receive a copy of every 'Ready to collect' notification."
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineGrid columns="1fr auto" gap="400">
                <Text variant="headingMd" as="h2">Custom SMTP</Text>
                {!canUseSmtp && (
                  <Text as="p" tone="subdued">Starter plan+</Text>
                )}
              </InlineGrid>
              {!canUseSmtp ? (
                <Banner tone="info">
                  Upgrade to Starter to use your own SMTP server and send emails from your domain.
                </Banner>
              ) : (
                <>
                  <InlineGrid columns={2} gap="400">
                    <TextField label="SMTP host" value={smtpHost} onChange={setSmtpHost} autoComplete="off" placeholder="smtp.gmail.com" disabled={!canUseSmtp} />
                    <TextField label="Port" value={smtpPort} onChange={setSmtpPort} autoComplete="off" type="number" disabled={!canUseSmtp} />
                  </InlineGrid>
                  <InlineGrid columns={2} gap="400">
                    <TextField label="SMTP username" value={smtpUser} onChange={setSmtpUser} autoComplete="off" disabled={!canUseSmtp} />
                    <TextField label="SMTP password" value={smtpPass} onChange={setSmtpPass} autoComplete="off" type="password" placeholder="Leave blank to keep current" disabled={!canUseSmtp} />
                  </InlineGrid>
                  <InlineGrid columns={2} gap="400">
                    <TextField label="From email" value={smtpFromEmail} onChange={setSmtpFromEmail} autoComplete="off" type="email" disabled={!canUseSmtp} />
                    <TextField label="From name" value={smtpFromName} onChange={setSmtpFromName} autoComplete="off" disabled={!canUseSmtp} />
                  </InlineGrid>
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd" as="h2">Click and Collect setup</Text>
                <Text as="p" tone="subdued">
                  We have configured everything you need in your Shopify store automatically. No manual setup required.
                </Text>
              </BlockStack>

              {setupMsg && (
                <Banner tone={setupMsg.ok ? "success" : "critical"} onDismiss={() => setSetupMsg(null)}>
                  {setupMsg.msg}
                </Banner>
              )}

              <BlockStack gap="200">
                <SetupRow
                  ok={setup.locationCount > 0 && setup.ratedLocationCount === setup.locationCount}
                  label={
                    setup.locationCount === 0
                      ? "Pickup locations created (add at least one)"
                      : `Shipping rates synced for ${setup.ratedLocationCount}/${setup.locationCount} pickup locations`
                  }
                />
                <SetupRow ok={!!setup.deliveryCustomizationId} label="Shipping waiver active (hides paid rates on pickup orders)" />
              </BlockStack>

              {setup.error && !setup.completed && (
                <Banner tone="warning">
                  Some setup steps did not complete: {setup.error}. Click "Re-run setup" below.
                </Banner>
              )}

              <InlineStack gap="200">
                <Button onClick={reRunSetup} loading={setupLoading}>Re-run setup</Button>
                <Text as="p" tone="subdued" variant="bodySm">
                  Use this if something is not working at checkout or after a Shopify settings change.
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Email branding</Text>
              <TextField label="Brand name" value={brandName} onChange={setBrandName} autoComplete="off" placeholder="Acme Store" />
              <TextField label="Logo URL" value={brandLogoUrl} onChange={setBrandLogoUrl} autoComplete="off" placeholder="https://cdn.shopify.com/..." helpText="Direct URL to your logo image (max 200px wide)." />
              <TextField label="Brand colour" value={brandPrimaryColor} onChange={setBrandPrimaryColor} autoComplete="off" placeholder="#1a1a1a" helpText="Used in email header background." />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


function SetupRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <InlineStack gap="200" blockAlign="center">
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: ok ? "#008060" : "#d1d5db",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {ok ? "✓" : ""}
      </div>
      <Text as="p" variant="bodyMd">{label}</Text>
    </InlineStack>
  );
}
