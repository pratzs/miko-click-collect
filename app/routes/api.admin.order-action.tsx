import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";
import { sendStatusEmail } from "../utils/email.server";

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
  const { orderId, intent } = body;

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

  // Extract status from intent like "advance_processing" or "advance_ready"
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

  await db.clickCollectOrder.update({
    where: { id: orderId },
    data: {
      status: nextStatus,
      ...(timestampField[nextStatus] ? { [timestampField[nextStatus]]: new Date() } : {}),
    },
  });

  const emailSent = await sendStatusEmail(
    order.shopConfig,
    { ...order, pickupLocation: order.pickupLocation },
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
