import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
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
  TextField,
  Modal,
  ProgressBar,
  ButtonGroup,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { sendStatusEmail } from "../utils/email.server";
import { format } from "date-fns";
import { parseLineItems, getNextStatus, minStatus, statusIndex } from "../utils/status";

const ALL_STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "packing", label: "Packing" },
  { key: "ready", label: "Ready to collect" },
  { key: "picked_up", label: "Collected" },
];

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const order = await db.clickCollectOrder.findFirst({
    where: { id, shop },
    include: { pickupLocation: true, shopConfig: true },
  });
  if (!order) throw new Response("Not found", { status: 404 });

  const emailLogs = await db.emailLog.findMany({
    where: { shop, orderId: id },
    orderBy: { sentAt: "desc" },
  });

  const lineItems = parseLineItems(order.lineItemsJson);

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
      serviceFee: order.serviceFee,
      merchantNotes: order.merchantNotes,
      expectedReadyAt: order.expectedReadyAt?.toISOString() ?? null,
      confirmedAt: order.confirmedAt?.toISOString() ?? order.createdAt.toISOString(),
      processingAt: order.processingAt?.toISOString() ?? null,
      packingAt: order.packingAt?.toISOString() ?? null,
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
      errorMessage: l.errorMessage,
      sentAt: l.sentAt.toISOString(),
    })),
    hasEmail: Boolean(
      (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) &&
      (process.env.RESEND_API_KEY || order.shopConfig.smtpHost)
    ),
    useProcessingStep: order.shopConfig.useProcessingStep,
    usePackingStep: order.shopConfig.usePackingStep,
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const form = await request.formData();
  const intent = form.get("intent") as string;

  const order = await db.clickCollectOrder.findFirst({
    where: { id, shop },
    include: { pickupLocation: true, shopConfig: true },
  });
  if (!order) return json({ error: "Order not found" }, { status: 404 });

  if (intent === "advance_status") {
    const nextStatus = form.get("nextStatus") as string;
    const validStatuses = ["processing", "packing", "ready", "picked_up"];
    if (!validStatuses.includes(nextStatus)) {
      return json({ error: "Invalid status" }, { status: 400 });
    }

    const timestampField = {
      processing: "processingAt",
      packing: "packingAt",
      ready: "readyAt",
      picked_up: "pickedUpAt",
    }[nextStatus];

    const items = parseLineItems(order.lineItemsJson);
    const updatedItems = items.map((item) => ({ ...item, status: nextStatus }));

    await db.clickCollectOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        lineItemsJson: updatedItems,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
    });

    let emailSent = false;
    const updatedOrder = { ...order, lineItemsJson: updatedItems };
    emailSent = await sendStatusEmail(order.shopConfig, { ...updatedOrder, pickupLocation: order.pickupLocation }, nextStatus);

    if (nextStatus === "ready" && emailSent) {
      await db.clickCollectOrder.update({
        where: { id },
        data: { readyNotificationSentAt: new Date() },
      });
    }

    if (nextStatus === "picked_up" && admin && order.shopifyOrderGid) {
      await fulfillOrder(admin, order.shopifyOrderGid);
    }

    const statusLabels: Record<string, string> = {
      processing: "All items marked as processing.",
      packing: "All items marked as packing.",
      ready: emailSent ? "All items ready. Customer notified!" : "All items marked as ready.",
      picked_up: "Order collected and fulfilled!",
    };

    return json({ ok: true, emailSent, message: statusLabels[nextStatus] ?? "Status updated." });
  }

  if (intent === "advance_item") {
    const itemIndexStr = form.get("itemIndex") as string;
    const nextStatus = form.get("nextStatus") as string;
    const itemIndex = parseInt(itemIndexStr, 10);

    const validStatuses = ["processing", "packing", "ready", "picked_up"];
    if (!validStatuses.includes(nextStatus) || isNaN(itemIndex)) {
      return json({ error: "Invalid parameters" }, { status: 400 });
    }

    const items = parseLineItems(order.lineItemsJson);
    if (itemIndex < 0 || itemIndex >= items.length) {
      return json({ error: "Invalid item index" }, { status: 400 });
    }

    items[itemIndex].status = nextStatus;

    const derivedOrderStatus = minStatus(items.map((i) => i.status ?? "confirmed"));

    const timestampField = {
      processing: "processingAt",
      packing: "packingAt",
      ready: "readyAt",
      picked_up: "pickedUpAt",
    }[derivedOrderStatus];

    const timestampData: Record<string, Date> = {};
    if (timestampField && !order[timestampField as keyof typeof order]) {
      timestampData[timestampField] = new Date();
    }

    await db.clickCollectOrder.update({
      where: { id },
      data: {
        status: derivedOrderStatus,
        lineItemsJson: items,
        ...timestampData,
      },
    });

    const allReady = items.every((i) => statusIndex(i.status ?? "confirmed") >= statusIndex("ready"));

    let emailSent = false;
    if (nextStatus === "ready" && allReady) {
      const updatedOrder = { ...order, lineItemsJson: items };
      emailSent = await sendStatusEmail(order.shopConfig, { ...updatedOrder, pickupLocation: order.pickupLocation }, "ready");
      if (emailSent) {
        await db.clickCollectOrder.update({
          where: { id },
          data: { readyNotificationSentAt: new Date() },
        });
      }
    }

    if (derivedOrderStatus === "picked_up" && admin && order.shopifyOrderGid) {
      await fulfillOrder(admin, order.shopifyOrderGid);
    }

    return json({
      ok: true,
      emailSent,
      message: `"${items[itemIndex].title}" marked as ${nextStatus.replace("_", " ")}.${allReady && nextStatus === "ready" && emailSent ? " Customer notified!" : ""}`,
    });
  }

  if (intent === "save_notes") {
    const notes = form.get("notes") as string;
    await db.clickCollectOrder.update({ where: { id }, data: { merchantNotes: notes } });
    return json({ ok: true, message: "Notes saved." });
  }

  if (intent === "resend_ready") {
    const emailSent = await sendStatusEmail(order.shopConfig, { ...order, pickupLocation: order.pickupLocation }, "ready");
    return json({ ok: true, emailSent, message: emailSent ? "Notification resent!" : "Email send failed. Check Settings." });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

async function fulfillOrder(admin: { graphql: Function }, orderGid: string) {
  try {
    const foRes = await admin.graphql(
      `query getOrder($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 5) {
            nodes {
              id
              status
              lineItems(first: 50) {
                nodes { id remainingQuantity }
              }
            }
          }
        }
      }`,
      { variables: { id: orderGid } },
    );
    const foData = await foRes.json();
    const fulfillmentOrders = foData.data?.order?.fulfillmentOrders?.nodes ?? [];

    for (const fo of fulfillmentOrders) {
      if (fo.status === "CLOSED" || fo.status === "CANCELLED") continue;
      const lineItems = fo.lineItems.nodes
        .filter((li: { remainingQuantity: number }) => li.remainingQuantity > 0)
        .map((li: { id: string }) => ({ id: li.id }));

      if (lineItems.length === 0) continue;

      await admin.graphql(
        `mutation fulfill($fulfillment: FulfillmentV2Input!) {
          fulfillmentCreateV2(fulfillment: $fulfillment) {
            fulfillment { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            fulfillment: {
              lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: lineItems }],
              trackingInfo: { company: "In-store pickup", number: "Collected" },
              notifyCustomer: false,
            },
          },
        },
      );
    }
  } catch (e) {
    console.error("Failed to fulfill order:", e);
  }
}

const STATUS_CONFIG: Record<string, { tone: "attention" | "success" | "info" | "critical" | "warning"; label: string }> = {
  confirmed: { tone: "attention", label: "Confirmed" },
  pending: { tone: "attention", label: "Confirmed" },
  processing: { tone: "warning", label: "Processing" },
  packing: { tone: "info", label: "Packing" },
  ready: { tone: "info", label: "Ready to collect" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" },
};

const ITEM_STATUS_CONFIG: Record<string, { tone: "attention" | "success" | "info" | "warning"; label: string }> = {
  confirmed: { tone: "attention", label: "Confirmed" },
  processing: { tone: "warning", label: "Processing" },
  packing: { tone: "info", label: "Packing" },
  ready: { tone: "info", label: "Ready" },
  picked_up: { tone: "success", label: "Collected" },
};

const NEXT_LABELS: Record<string, string> = {
  processing: "Start Processing",
  packing: "Start Packing",
  ready: "Mark Ready",
  picked_up: "Mark Collected",
};

function OrderProgressBar({ status, useProcessing, usePacking }: { status: string; useProcessing: boolean; usePacking: boolean }) {
  const steps = ALL_STEPS.filter((s) => {
    if (s.key === "processing" && !useProcessing) return false;
    if (s.key === "packing" && !usePacking) return false;
    return true;
  });

  const currentIdx = steps.findIndex((s) => s.key === status || (s.key === "confirmed" && status === "pending"));
  const progress = steps.length > 1 ? ((Math.max(0, currentIdx)) / (steps.length - 1)) * 100 : 0;

  return (
    <BlockStack gap="200">
      <ProgressBar progress={progress} size="small" tone="primary" />
      <InlineStack align="space-between">
        {steps.map((step, i) => {
          const isActive = i <= currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <BlockStack key={step.key} gap="050" inlineAlign="center">
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  background: isActive ? "#2C6ECB" : "#E4E5E7",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "11px",
                }}
              >
                {isActive ? (
                  <svg width="12" height="12" viewBox="0 0 20 20" fill="white">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                ) : i + 1}
              </div>
              <Text variant="bodySm" as="p" fontWeight={isCurrent ? "bold" : "regular"} tone={isActive ? undefined : "subdued"}>
                {step.label}
              </Text>
            </BlockStack>
          );
        })}
      </InlineStack>
    </BlockStack>
  );
}

export default function OrderDetailPage() {
  const { order, location, emailLogs, hasEmail, useProcessingStep, usePackingStep } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ ok?: boolean; message?: string; emailSent?: boolean }>();

  const [notes, setNotes] = useState(order.merchantNotes);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    intent: string;
    nextStatus: string;
    itemIndex?: number;
    itemTitle?: string;
  } | null>(null);

  const badge = STATUS_CONFIG[order.status] ?? { tone: "attention", label: order.status };
  const isSubmitting = fetcher.state !== "idle";

  function submitAction(intent: string, extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("intent", intent);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    fetcher.submit(fd, { method: "POST" });
  }

  function openConfirmAll(nextStatus: string) {
    setConfirmAction({ intent: "advance_status", nextStatus });
    setConfirmModalOpen(true);
  }

  function openConfirmItem(itemIndex: number, nextStatus: string, itemTitle: string) {
    setConfirmAction({ intent: "advance_item", nextStatus, itemIndex, itemTitle });
    setConfirmModalOpen(true);
  }

  function doConfirm() {
    if (!confirmAction) return;
    if (confirmAction.intent === "advance_status") {
      submitAction("advance_status", { nextStatus: confirmAction.nextStatus });
    } else if (confirmAction.intent === "advance_item") {
      submitAction("advance_item", {
        nextStatus: confirmAction.nextStatus,
        itemIndex: String(confirmAction.itemIndex),
      });
    }
    setConfirmModalOpen(false);
  }

  const orderNextStatus = getNextStatus(order.status, useProcessingStep, usePackingStep);

  const lineItems = order.lineItems;
  const hasMultipleItems = lineItems.length > 1;
  const hasItemStatuses = lineItems.some((i) => i.status);
  const hasMixedStatuses = hasItemStatuses && new Set(lineItems.map((i) => i.status)).size > 1;

  const confirmTitle = confirmAction
    ? confirmAction.intent === "advance_item"
      ? `${NEXT_LABELS[confirmAction.nextStatus] ?? "Next step"}: ${confirmAction.itemTitle}`
      : `${NEXT_LABELS[confirmAction.nextStatus] ?? "Next step"}: All Items`
    : "Confirm";

  const confirmMessage = confirmAction
    ? confirmAction.intent === "advance_item"
      ? `Mark "${confirmAction.itemTitle}" as ${(ITEM_STATUS_CONFIG[confirmAction.nextStatus]?.label ?? confirmAction.nextStatus).toLowerCase()}?`
      : confirmAction.nextStatus === "picked_up"
        ? `Confirm ${order.customerName || order.customerEmail} has collected ${order.orderName}? This will fulfill the order in Shopify.`
        : confirmAction.nextStatus === "ready"
          ? `Mark all items in ${order.orderName} as ready to collect?${hasEmail ? " The customer will be notified by email." : ""}`
          : `Move all items in ${order.orderName} to ${(ITEM_STATUS_CONFIG[confirmAction.nextStatus]?.label ?? confirmAction.nextStatus).toLowerCase()}?`
    : "";

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
        <Layout.Section>
          <BlockStack gap="400">

            {/* Progress + status */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">{order.orderName}</Text>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </BlockStack>
                  <Text variant="bodySm" tone="subdued" as="p">{format(new Date(order.createdAt), "d MMM yyyy, h:mm a")}</Text>
                </InlineStack>

                <OrderProgressBar
                  status={order.status}
                  useProcessing={useProcessingStep}
                  usePacking={usePackingStep}
                />

                <Divider />

                {/* Main action buttons */}
                <BlockStack gap="200">
                  {orderNextStatus && (
                    <Button
                      variant="primary"
                      size="large"
                      fullWidth
                      loading={isSubmitting}
                      onClick={() => openConfirmAll(orderNextStatus)}
                    >
                      {NEXT_LABELS[orderNextStatus] ?? "Next step"} (All Items)
                    </Button>
                  )}
                  {order.status === "ready" && hasEmail && (
                    <Button
                      variant="plain"
                      fullWidth
                      loading={isSubmitting}
                      onClick={() => submitAction("resend_ready")}
                    >
                      Resend "Ready" notification
                    </Button>
                  )}
                  {order.status === "picked_up" && (
                    <Banner tone="success">
                      Collected {order.pickedUpAt ? format(new Date(order.pickedUpAt), "d MMM yyyy h:mm a") : ""}
                    </Banner>
                  )}
                </BlockStack>

                {/* Timeline */}
                {(order.processingAt || order.packingAt || order.readyAt || order.pickedUpAt) && (
                  <>
                    <Divider />
                    <BlockStack gap="200">
                      <Text variant="headingSm" as="h3">Timeline</Text>
                      <Text variant="bodySm" tone="subdued" as="p">
                        Confirmed: {format(new Date(order.confirmedAt || order.createdAt), "d MMM yyyy h:mm a")}
                      </Text>
                      {order.processingAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          Processing: {format(new Date(order.processingAt), "d MMM yyyy h:mm a")}
                        </Text>
                      )}
                      {order.packingAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          Packing: {format(new Date(order.packingAt), "d MMM yyyy h:mm a")}
                        </Text>
                      )}
                      {order.readyAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          Ready: {format(new Date(order.readyAt), "d MMM yyyy h:mm a")}
                          {order.readyNotificationSentAt ? " - Customer notified" : ""}
                        </Text>
                      )}
                      {order.pickedUpAt && (
                        <Text variant="bodySm" tone="subdued" as="p">
                          Collected: {format(new Date(order.pickedUpAt), "d MMM yyyy h:mm a")}
                        </Text>
                      )}
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Items with per-item controls */}
            {lineItems.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Items</Text>
                    {hasMixedStatuses && (
                      <Badge tone="warning">Mixed status</Badge>
                    )}
                  </InlineStack>
                  <Divider />
                  {lineItems.map((item, i) => {
                    const itemStatus = item.status ?? order.status;
                    const itemBadge = ITEM_STATUS_CONFIG[itemStatus] ?? { tone: "attention" as const, label: itemStatus };
                    const itemNext = hasMultipleItems
                      ? getNextStatus(itemStatus, useProcessingStep, usePackingStep)
                      : null;

                    return (
                      <Box key={i}>
                        <BlockStack gap="200">
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <Text as="p" fontWeight="semibold">{item.title}</Text>
                              <InlineStack gap="200">
                                <Text as="p" tone="subdued">x{item.quantity}</Text>
                                <Text as="p" tone="subdued">{order.currency} {item.price}</Text>
                              </InlineStack>
                            </BlockStack>
                            <InlineStack gap="200" blockAlign="center">
                              <Badge tone={itemBadge.tone}>{itemBadge.label}</Badge>
                              {hasMultipleItems && itemNext && (
                                <Button
                                  size="slim"
                                  loading={isSubmitting}
                                  onClick={() => openConfirmItem(i, itemNext, item.title)}
                                >
                                  {NEXT_LABELS[itemNext]}
                                </Button>
                              )}
                            </InlineStack>
                          </InlineStack>
                          {i < lineItems.length - 1 && <Divider />}
                        </BlockStack>
                      </Box>
                    );
                  })}
                  <Divider />
                  <InlineStack align="space-between">
                    <Text variant="bodyMd" fontWeight="semibold" as="p">Total</Text>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">{order.currency} {order.totalPrice}</Text>
                  </InlineStack>
                  {order.serviceFee && order.serviceFee !== "0" && (
                    <InlineStack align="space-between">
                      <Text variant="bodySm" tone="subdued" as="p">Pickup service fee</Text>
                      <Text variant="bodySm" tone="subdued" as="p">{order.currency} {order.serviceFee}</Text>
                    </InlineStack>
                  )}
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
                <Button onClick={() => submitAction("save_notes", { notes })} loading={isSubmitting}>
                  Save notes
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Customer</Text>
                <Text as="p">{order.customerName || "-"}</Text>
                {order.customerEmail && <Text as="p" tone="subdued">{order.customerEmail}</Text>}
                {order.customerPhone && <Text as="p" tone="subdued">{order.customerPhone}</Text>}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h2">Pickup location</Text>
                <Text variant="bodyMd" fontWeight="semibold" as="p">{location.name}</Text>
                {location.address && <Text as="p" tone="subdued">{location.address}</Text>}
                {location.city && (
                  <Text as="p" tone="subdued">{location.city}{location.postcode ? ` ${location.postcode}` : ""}</Text>
                )}
                {location.phone && <Text as="p" tone="subdued">{location.phone}</Text>}
                {location.collectionInstructions && (
                  <>
                    <Divider />
                    <Text variant="bodySm" tone="subdued" as="p">{location.collectionInstructions}</Text>
                  </>
                )}
              </BlockStack>
            </Card>

            {emailLogs.length > 0 && (
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">Notifications</Text>
                  {emailLogs.map((log) => (
                    <Box key={log.id}>
                      <InlineStack align="space-between">
                        <BlockStack gap="100">
                          <Text variant="bodySm" as="p" fontWeight="semibold">
                            {log.type === "ready" ? "Ready" : log.type === "picked_up" ? "Collected" : log.type === "processing" ? "Processing" : log.type === "packing" ? "Packing" : log.type}
                          </Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {format(new Date(log.sentAt), "d MMM h:mm a")}
                          </Text>
                        </BlockStack>
                        <Badge tone={log.status === "sent" ? "success" : "critical"}>{log.status}</Badge>
                      </InlineStack>
                      {log.status === "failed" && log.errorMessage && (
                        <Text variant="bodySm" tone="critical" as="p">{log.errorMessage}</Text>
                      )}
                    </Box>
                  ))}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title={confirmTitle}
        primaryAction={{
          content: confirmAction
            ? confirmAction.intent === "advance_item"
              ? `${NEXT_LABELS[confirmAction.nextStatus] ?? "Confirm"}`
              : `${NEXT_LABELS[confirmAction.nextStatus] ?? "Confirm"} (All)`
            : "Confirm",
          onAction: doConfirm,
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setConfirmModalOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">{confirmMessage}</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
