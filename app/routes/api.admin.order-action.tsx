import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";
import { sendReadyToCollectEmail, sendPickedUpEmail } from "../utils/email.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const body = await request.json();
  const { orderId, intent } = body;

  if (!orderId || !intent) {
    return json({ ok: false, message: "Missing orderId or intent" }, { status: 400, headers: corsHeaders() });
  }

  const order = await db.clickCollectOrder.findFirst({
    where: { id: orderId },
    include: { pickupLocation: true, shopConfig: true },
  });

  if (!order) {
    return json({ ok: false, message: "Order not found" }, { status: 404, headers: corsHeaders() });
  }

  if (intent === "mark_ready") {
    await db.clickCollectOrder.update({
      where: { id: orderId },
      data: { status: "ready", readyAt: new Date() },
    });

    let emailSent = false;
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      emailSent = await sendReadyToCollectEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation,
      });
      if (emailSent) {
        await db.clickCollectOrder.update({
          where: { id: orderId },
          data: { readyNotificationSentAt: new Date() },
        });
      }
    }

    return json({ ok: true, emailSent }, { headers: corsHeaders() });
  }

  if (intent === "mark_picked_up") {
    await db.clickCollectOrder.update({
      where: { id: orderId },
      data: { status: "picked_up", pickedUpAt: new Date() },
    });

    let emailSent = false;
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      emailSent = await sendPickedUpEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation,
      });
    }

    return json({ ok: true, emailSent }, { headers: corsHeaders() });
  }

  return json({ ok: false, message: "Unknown intent" }, { status: 400, headers: corsHeaders() });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://admin.shopify.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
