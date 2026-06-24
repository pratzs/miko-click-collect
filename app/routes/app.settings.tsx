import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Button,
  TextField,
  Banner,
  Divider,
  Box,
  Select,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { hasSmtp } from "../utils/plans";

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
    },
  });

  return json({ ok: true, message: "Settings saved!" });
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok?: boolean; message?: string }>();

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
