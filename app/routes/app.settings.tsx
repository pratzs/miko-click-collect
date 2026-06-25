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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await db.shopConfig.findUnique({ where: { shop } });

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
    deliveryCustomizationId: config?.deliveryCustomizationId ?? "",
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
  const [dcLoading, setDcLoading] = useState(false);
  const [dcStatus, setDcStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [deliveryCustomizationId, setDeliveryCustomizationId] = useState(data.deliveryCustomizationId);

  async function enableDeliveryCustomization() {
    setDcLoading(true);
    setDcStatus(null);
    try {
      const token = await shopify.idToken();
      const res = await fetch("/api/enable-delivery-customization", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "enable" }),
      });
      let result: { ok: boolean; id?: string; error?: string } = { ok: false };
      try {
        result = await res.json();
      } catch {
        setDcStatus({ ok: false, msg: `HTTP ${res.status} - unexpected response. The route may not be deployed yet. Refresh and try again.` });
        return;
      }
      if (result.ok) {
        setDeliveryCustomizationId(result.id ?? "enabled");
        setDcStatus({ ok: true, msg: "Shipping waiver enabled. Customers who select click and collect will not see shipping options." });
      } else {
        setDcStatus({ ok: false, msg: result.error ?? "Failed to enable. Make sure you have deployed the app extensions." });
      }
    } catch (e) {
      setDcStatus({ ok: false, msg: `Error: ${e instanceof Error ? e.message : String(e)}` });
    }
    setDcLoading(false);
  }

  async function disableDeliveryCustomization() {
    setDcLoading(true);
    setDcStatus(null);
    try {
      const token = await shopify.idToken();
      const res = await fetch("/api/enable-delivery-customization", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "disable" }),
      });
      const json = await res.json() as { ok: boolean };
      if (json.ok) {
        setDeliveryCustomizationId("");
        setDcStatus({ ok: true, msg: "Shipping waiver disabled. Shipping options will show normally." });
      }
    } catch {
      setDcStatus({ ok: false, msg: "Network error. Please try again." });
    }
    setDcLoading(false);
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
                <Text variant="headingMd" as="h2">Shipping waiver</Text>
                <Text as="p" tone="subdued">
                  When enabled, any standard shipping rates are hidden at checkout when a customer selects in-store pickup. To use this feature you must first add a free "Click and Collect" shipping rate in your Shopify Admin under <strong>Settings → Shipping and delivery → Shipping rates → Add rate</strong> and name it something containing the word "Collect", "Pickup", or "Local" (e.g. "Click and Collect — Free"). That rate will remain visible; all paid shipping rates will be hidden.
                </Text>
              </BlockStack>
              {dcStatus && (
                <Banner tone={dcStatus.ok ? "success" : "critical"} onDismiss={() => setDcStatus(null)}>
                  {dcStatus.msg}
                </Banner>
              )}
              <InlineStack gap="300" blockAlign="center">
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: deliveryCustomizationId ? "#10b981" : "#d1d5db",
                    flexShrink: 0,
                  }}
                />
                <Text as="p">
                  {deliveryCustomizationId ? "Shipping waiver is active" : "Shipping waiver is not enabled"}
                </Text>
              </InlineStack>
              {deliveryCustomizationId ? (
                <Button tone="critical" onClick={disableDeliveryCustomization} loading={dcLoading}>
                  Disable shipping waiver
                </Button>
              ) : (
                <Button variant="primary" onClick={enableDeliveryCustomization} loading={dcLoading}>
                  Enable shipping waiver
                </Button>
              )}
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
