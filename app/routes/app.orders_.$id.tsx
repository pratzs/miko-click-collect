import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
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
  Divider,
  Box,
  Banner,
  TextField,
  Modal,
  DatePicker,
  Popover,
  Select,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { sendReadyToCollectEmail, sendPickedUpEmail } from "../utils/email.server";
import { format } from "date-fns";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const order = await db.clickCollectOrder.findFirst({
    where: { id, shop },
    include: {
      pickupLocation: true,
      shopConfig: true,
    },
  });

  if (!order) throw new Response("Not found", { status: 404 });

  const emailLogs = await db.emailLog.findMany({
    where: { shop, orderId: id },
    orderBy: { sentAt: "desc" },
  });

  const lineItems = Array.isArray(order.lineItemsJson) ? order.lineItemsJson : [];

  return json({
    order: {
      id: order.id,
      orderName: order.shopifyOrderName,
      shopifyOrderGid: order.shopifyOrderGid,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      status: order.status,
      totalPrice: order.totalPrice,
      currency: order.currency,
      merchantNotes: order.merchantNotes,
      expectedReadyAt: order.expectedReadyAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
      readyNotificationSentAt: order.readyNotificationSentAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      lineItems,
    },
    location: {
      id: order.pickupLocation.id,
      name: order.pickupLocation.name,
      address: order.pickupLocation.address,
      city: order.pickupLocation.city,
      postcode: order.pickupLocation.postcode,
      phone: order.pickupLocation.phone,
      collectionInstructions: order.pickupLocation.collectionInstructions,
    },
    emailLogs: emailLogs.map((l) => ({
      id: l.id,
      type: l.type,
      recipientEmail: l.recipientEmail,
      subject: l.subject,
      status: l.status,
      sentAt: l.sentAt.toISOString(),
    })),
    hasEmail: Boolean(order.shopConfig.replyToEmail || order.shopConfig.smtpHost),
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const form = await request.formData();
  const intent = form.get("intent") as string;

  const order = await db.clickCollectOrder.findFirst({
    where: { id, shop },
    include: { pickupLocation: true, shopConfig: true },
  });
  if (!order) return json({ error: "Order not found" }, { status: 404 });

  if (intent === "mark_ready") {
    await db.clickCollectOrder.update({
      where: { id },
      data: {
        status: "ready",
        readyAt: new Date(),
      },
    });

    // Send ready notification email
    let emailSent = false;
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      emailSent = await sendReadyToCollectEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation,
      });
      if (emailSent) {
        await db.clickCollectOrder.update({
          where: { id },
          data: { readyNotificationSentAt: new Date() },
        });
      }
    }

    return json({ ok: true, emailSent, message: emailSent ? "Order marked ready. Notification sent!" : "Order marked ready." });
  }

  if (intent === "mark_picked_up") {
    await db.clickCollectOrder.update({
      where: { id },
      data: { status: "picked_up", pickedUpAt: new Date() },
    });

    let emailSent = false;
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      emailSent = await sendPickedUpEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation,
      });
    }

    return json({ ok: true, emailSent, message: "Order marked as collected!" });
  }

  if (intent === "save_notes") {
    const notes = form.get("notes") as string;
    await db.clickCollectOrder.update({ where: { id }, data: { merchantNotes: notes } });
    return json({ ok: true, message: "Notes saved." });
  }

  if (intent === "resend_ready") {
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      const emailSent = await sendReadyToCollectEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation,
      });
      return json({ ok: true, emailSent, message: emailSent ? "Notification resent!" : "Email not configured." });
    }
    return json({ ok: false, message: "Configure email in Settings first." });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

const STATUS_BADGE: Record<string, { tone: "attention" | "success" | "info" | "critical"; label: string }> = {
  pending: { tone: "attention", label: "Pending" },
  ready: { tone: "info", label: "Ready to collect" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" },
};

export default function OrderDetailPage() {
  const { order, location, emailLogs, hasEmail } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; message?: string; emailSent?: boolean }>();

  const [notes, setNotes] = useState(order.merchantNotes);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"mark_ready" | "mark_picked_up" | null>(null);

  const badge = STATUS_BADGE[order.status] ?? { tone: "attention", label: order.status };
  const isSubmitting = fetcher.state !== "idle";

  function submitAction(intent: string, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("intent", intent);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    fetcher.submit(fd, { method: "POST" });
  }

  function openConfirm(action: "mark_ready" | "mark_picked_up") {
    setConfirmAction(action);
    setConfirmModalOpen(true);
  }

  function doConfirm() {
    if (confirmAction) submitAction(confirmAction);
    setConfirmModalOpen(false);
  }

  const lineItems = Array.isArray(order.lineItems) ? order.lineItems as Array<{ title: string; quantity: number; price: string }> : [];

  return (
    <Page
      title={`Order ${order.orderName}`}
      backAction={{ content: "Orders", onAction: () => navigate("/app/orders") }}
    >
      {fetcher.data?.message && (
        <Box paddingBlockEnd="400">
          <Banner tone={fetcher.data.ok ? "success" : "warning"}>{fetcher.data.message}</Banner>
        </Box>
      )}

      <Layout>
        {/* Left: Order details + actions */}
        <Layout.Section>
          <BlockStack gap="400">

            {/* Status + main actions */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">{order.orderName}</Text>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </BlockStack>
                  <Text variant="bodySm" tone="subdued" as="p">{format(new Date(order.createdAt), "d MMM yyyy, h:mm a")}</Text>
                </InlineStack>

                <Divider />

                {/* Action buttons */}
                <BlockStack gap="200">
                  {order.status === "pending" && (
                    <Button
                      variant="primary"
                      size="large"
                      fullWidth
                      loading={isSubmitting && confirmAction === "mark_ready"}
                      onClick={() => openConfirm("mark_ready")}
                    >
                      ✅ Mark as Ready to Collect
                    </Button>
                  )}
                  {order.status === "ready" && (
                    <>
                      <Button
                        variant="primary"
                        size="large"
                        fullWidth
                        loading={isSubmitting && confirmAction === "mark_picked_up"}
                        onClick={() => openConfirm("mark_picked_up")}
                      >
                        🛍️ Mark as Picked Up
                      </Button>
                      {hasEmail && (
                        <Button
                          variant="plain"
                          fullWidth
                          loading={isSubmitting}
                          onClick={() => submitAction("resend_ready")}
                        >
                          Resend "Ready" notification
                        </Button>
                      )}
                    </>
                  )}
                  {order.status === "picked_up" && (
                    <Banner tone="success">
                      Collected {order.pickedUpAt ? format(new Date(order.pickedUpAt), "d MMM yyyy h:mm a") : ""}
                    </Banner>
                  )}
                </BlockStack>

                {/* Timeline */}
                {(order.readyAt || order.pickedUpAt) && (
                  <>
                    <Divider />
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Timeline</Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        📦 Order received: {format(new Date(order.createdAt), "d MMM yyyy h:mm a")}
                      </Text>
                      {order.readyAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          ✅ Marked ready: {format(new Date(order.readyAt), "d MMM yyyy h:mm a")}
                          {order.readyNotificationSentAt ? " · Notification sent" : " · No notification sent"}
                        </Text>
                      )}
                      {order.pickedUpAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          🛍️ Collected: {format(new Date(order.pickedUpAt), "d MMM yyyy h:mm a")}
                        </Text>
                      )}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Items */}
            {lineItems.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text variant="headingMd" as="h2">Items</Text>
                  <Divider />
                  {lineItems.map((item, i) => (
                    <Box key={i}>
                      <InlineStack align="space-between">
                        <Text as="p">{item.title}</Text>
                        <InlineStack gap="300">
                          <Text as="p" tone="subdued">×{item.quantity}</Text>
                          <Text as="p">{item.price}</Text>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">Total</Text>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">{order.currency} {order.totalPrice}</Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {/* Merchant notes */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">Internal notes</Text>
                <TextField
                  label="Notes"
                  labelHidden
                  value={notes}
                  onChange={setNotes}
                  multiline={3}
                  autoComplete="off"
                  placeholder="Notes visible only to you..."
                />
                <Button
                  onClick={() => submitAction("save_notes", { notes })}
                  loading={isSubmitting}
                >
                  Save notes
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right: Customer + Location + Email log */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Customer */}
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Customer</Text>
                <Text as="p">{order.customerName || "—"}</Text>
                {order.customerEmail && <Text as="p" tone="subdued">{order.customerEmail}</Text>}
                {order.customerPhone && <Text as="p" tone="subdued">{order.customerPhone}</Text>}
              </BlockStack>
            </Card>

            {/* Pickup location */}
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Pickup location</Text>
                <Text variant="bodyMd" fontWeight="semibold" as="p">{location.name}</Text>
                {location.address && <Text as="p" tone="subdued">{location.address}</Text>}
                {location.city && (
                  <Text as="p" tone="subdued">{location.city}{location.postcode ? ` ${location.postcode}` : ""}</Text>
                )}
                {location.phone && <Text as="p" tone="subdued">📞 {location.phone}</Text>}
                {location.collectionInstructions && (
                  <>
                    <Divider />
                    <Text variant="bodySm" tone="subdued" as="p">{location.collectionInstructions}</Text>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Email log */}
            {emailLogs.length > 0 && (
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">Notifications</Text>
                  {emailLogs.map((log) => (
                    <Box key={log.id}>
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text variant="bodySm" as="p" fontWeight="semibold">
                            {log.type === "ready_to_collect" ? "Ready notification" : "Collected confirmation"}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {format(new Date(log.sentAt), "d MMM h:mm a")}
                          </Text>
                        </BlockStack>
                        <Badge tone={log.status === "sent" ? "success" : "critical"}>{log.status}</Badge>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Confirm modal */}
      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={confirmAction === "mark_ready" ? "Mark order as ready?" : "Mark order as collected?"}
        primaryAction={{
          content: confirmAction === "mark_ready" ? "Mark Ready & Notify Customer" : "Mark as Collected",
          onAction: doConfirm,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirmModalOpen(false) }]}
      >
        <Modal.Section>
          {confirmAction === "mark_ready" ? (
            <Text as="p">
              This will mark order <strong>{order.orderName}</strong> as ready to collect
              {hasEmail ? " and send a notification email to the customer." : ". No email will be sent (configure email in Settings)."}
            </Text>
          ) : (
            <Text as="p">
              Confirm that <strong>{order.customerName || order.customerEmail}</strong> has collected order{" "}
              <strong>{order.orderName}</strong>. This action cannot be undone.
            </Text>
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
