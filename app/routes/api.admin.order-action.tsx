import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { sendStatusEmail } from "../utils/email.server";
import { parseLineItems, minStatus } from "../utils/status";
import { markReadyForPickupInShopify } from "../utils/pickup-status.server";

/**
 * Advance a click and collect order from the admin order-details extensions.
 *
 * Read the note in api.admin.order-status.tsx first: this endpoint had the same
 * hole, and on a write path it was considerably worse. With no authentication
 * and no shop scoping, anyone who could name an order id could move any
 * merchant's order to any status AND make this app send that merchant's
 * customer a "your order is ready to collect" email, from the merchant's own
 * sending identity. The id needed was handed out by the status endpoint. So the
 * whole chain — find an order, mark it ready, mail the shopper — was open to
 * the internet, and the visible damage would have been shoppers driving to a
 * store to collect an order nobody had packed.
 *
 * Every request must now carry a valid Shopify session token, and every read
 * and write is scoped to that session's shop.
 */

const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const loader = async () => new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: PREFLIGHT_HEADERS });
  }

  const { session, admin, cors } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json();
  const { orderId, intent, itemIndex: rawItemIndex } = body;

  if (!orderId || !intent) {
    return cors(json({ ok: false, message: "Missing orderId or intent" }, { status: 400 }));
  }

  const order = await db.clickCollectOrder.findFirst({
    where: { id: orderId, shop },
    include: { pickupLocation: true, shopConfig: true },
  });

  if (!order) {
    return cors(json({ ok: false, message: "Order not found" }, { status: 404 }));
  }

  const statusMatch = String(intent).match(/^advance_(.+)$/);
  if (!statusMatch) {
    return cors(json({ ok: false, message: "Unknown intent" }, { status: 400 }));
  }

  const nextStatus = statusMatch[1];
  const validStatuses = ["processing", "packing", "ready", "picked_up"];
  if (!validStatuses.includes(nextStatus)) {
    return cors(json({ ok: false, message: "Invalid status" }, { status: 400 }));
  }

  const timestampField: Record<string, string> = {
    processing: "processingAt",
    packing: "packingAt",
    ready: "readyAt",
    picked_up: "pickedUpAt",
  };

  const previousStatus = order.status;
  const items = parseLineItems(order.lineItemsJson);
  const itemIndex = typeof rawItemIndex === "number" ? rawItemIndex : null;

  let appliedStatus = nextStatus;

  if (itemIndex !== null && itemIndex >= 0 && itemIndex < items.length) {
    items[itemIndex].status = nextStatus;
    const derivedStatus = minStatus(items.map((i) => i.status ?? "confirmed"));
    appliedStatus = derivedStatus;

    const tsData: Record<string, Date> = {};
    const tsField = timestampField[derivedStatus];
    if (tsField && !order[tsField as keyof typeof order]) {
      tsData[tsField] = new Date();
    }

    await db.clickCollectOrder.update({
      where: { id: order.id },
      data: { status: derivedStatus, lineItemsJson: items, ...tsData },
    });
  } else {
    const updatedItems = items.map((item) => ({ ...item, status: nextStatus }));
    await db.clickCollectOrder.update({
      where: { id: order.id },
      data: {
        status: nextStatus,
        lineItemsJson: updatedItems,
        ...(timestampField[nextStatus] ? { [timestampField[nextStatus]]: new Date() } : {}),
      },
    });
  }

  const updatedOrder = await db.clickCollectOrder.findFirst({
    where: { id: order.id, shop },
    include: { pickupLocation: true, shopConfig: true },
  });

  // Email on a real change of the ORDER's status, and only then.
  //
  // Per-item actions are the trap. Marking one of three items ready leaves the
  // order at "confirmed", because an order is only as ready as its least ready
  // item — but the old code mailed the shopper the status it was ASKED for
  // rather than the one the order ended up in. So ticking off the first item of
  // a three-item order sent "your order is ready to collect", and the shopper
  // drove to the store for two items that were still on the shelf. Sending the
  // derived status instead would swing the other way and re-send "Order
  // confirmed" on every item tick. Comparing against the status the order was
  // already in gets both right: partial progress is silent, and the shopper
  // hears from us exactly once, when the order itself moves.
  // Ready has to reach Shopify, or the order page this extension is rendered
  // inside will still be offering its own "Ready for pickup" button.
  let readySync: { ok: boolean; notified: boolean } = { ok: true, notified: false };
  if (appliedStatus === "ready" && appliedStatus !== previousStatus && order.shopifyOrderGid) {
    readySync = await markReadyForPickupInShopify(admin, order.shopifyOrderGid);
  }

  const shouldEmail =
    appliedStatus !== previousStatus &&
    (appliedStatus !== "ready" || order.shopConfig.sendOwnReadyEmail || !readySync.notified);

  const emailSent = shouldEmail
    ? await sendStatusEmail(
        order.shopConfig,
        { ...updatedOrder!, pickupLocation: order.pickupLocation },
        appliedStatus,
      )
    : false;

  // Shopify's own notification counts as the customer having been told.
  if (appliedStatus === "ready" && (emailSent || readySync.notified)) {
    await db.clickCollectOrder.update({
      where: { id: order.id },
      data: { readyNotificationSentAt: new Date() },
    });
  }

  return cors(json({ ok: true, emailSent }));
};
