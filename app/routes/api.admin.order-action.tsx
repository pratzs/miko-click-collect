import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";
import { sendStatusEmail } from "../utils/email.server";
import { parseLineItems, minStatus } from "../utils/status";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const loader = async () => {
  return new Response(null, { status: 204, headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const body = await request.json();
  const { orderId, intent, itemIndex: rawItemIndex } = body;

  if (!orderId || !intent) {
    return json({ ok: false, message: "Missing orderId or intent" }, { status: 400, headers: CORS });
  }

  const order = await db.clickCollectOrder.findFirst({
    where: { id: orderId },
    include: { pickupLocation: true, shopConfig: true },
  });

  if (!order) {
    return json({ ok: false, message: "Order not found" }, { status: 404, headers: CORS });
  }

  const statusMatch = intent.match(/^advance_(.+)$/);
  if (!statusMatch) {
    return json({ ok: false, message: "Unknown intent" }, { status: 400, headers: CORS });
  }

  const nextStatus = statusMatch[1];
  const validStatuses = ["processing", "packing", "ready", "picked_up"];
  if (!validStatuses.includes(nextStatus)) {
    return json({ ok: false, message: "Invalid status" }, { status: 400, headers: CORS });
  }

  const timestampField: Record<string, string> = {
    processing: "processingAt",
    packing: "packingAt",
    ready: "readyAt",
    picked_up: "pickedUpAt",
  };

  const items = parseLineItems(order.lineItemsJson);
  const itemIndex = typeof rawItemIndex === "number" ? rawItemIndex : null;

  if (itemIndex !== null && itemIndex >= 0 && itemIndex < items.length) {
    items[itemIndex].status = nextStatus;
    const derivedStatus = minStatus(items.map((i) => i.status ?? "confirmed"));

    const tsData: Record<string, Date> = {};
    const tsField = timestampField[derivedStatus];
    if (tsField && !order[tsField as keyof typeof order]) {
      tsData[tsField] = new Date();
    }

    await db.clickCollectOrder.update({
      where: { id: orderId },
      data: { status: derivedStatus, lineItemsJson: items, ...tsData },
    });
  } else {
    const updatedItems = items.map((item) => ({ ...item, status: nextStatus }));
    await db.clickCollectOrder.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        lineItemsJson: updatedItems,
        ...(timestampField[nextStatus] ? { [timestampField[nextStatus]]: new Date() } : {}),
      },
    });
  }

  const updatedOrder = await db.clickCollectOrder.findFirst({
    where: { id: orderId },
    include: { pickupLocation: true, shopConfig: true },
  });

  const emailSent = await sendStatusEmail(
    order.shopConfig,
    { ...updatedOrder!, pickupLocation: order.pickupLocation },
    nextStatus,
  );

  if (nextStatus === "ready" && emailSent) {
    await db.clickCollectOrder.update({
      where: { id: orderId },
      data: { readyNotificationSentAt: new Date() },
    });
  }

  return json({ ok: true, emailSent }, { headers: CORS });
};
