import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

/**
 * The other direction: Shopify told us an order is ready.
 *
 * Marking ready is not this app's private act. A merchant can do it from the
 * Shopify order page, from the mobile admin, or in POS, and until now none of
 * that reached this app — so the counter screen would still say "Confirmed" for
 * an order whose customer had already been emailed to come and collect it, and
 * a second person working here would prepare it all over again.
 *
 * Shopify fires this the moment a pickup fulfillment order is marked prepared,
 * including when this app is the one that did it, which is why nothing here
 * sends an email: whoever marked it ready, Shopify has already told the
 * customer.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "FULFILLMENT_ORDERS_LINE_ITEMS_PREPARED_FOR_PICKUP") {
    return json({ ok: true });
  }

  const body = payload as {
    fulfillment_order?: { id?: number | string; order_id?: number | string };
  };
  const orderId = body.fulfillment_order?.order_id;
  if (!orderId) return json({ ok: true });

  const order = await db.clickCollectOrder.findFirst({
    where: { shop, shopifyOrderId: String(orderId) },
    select: { id: true, status: true },
  });

  // Not one of ours, or already past ready. Never roll a collected order back.
  if (!order) return json({ ok: true });
  if (order.status === "ready" || order.status === "picked_up" || order.status === "cancelled") {
    return json({ ok: true });
  }

  await db.clickCollectOrder.update({
    where: { id: order.id },
    data: {
      status: "ready",
      readyAt: new Date(),
      // Shopify sent the notification, so record that the customer has been
      // told. Otherwise the order screen offers to "resend" a mail we never
      // sent, and the uncollected-order timers would start from the wrong
      // moment.
      readyNotificationSentAt: new Date(),
    },
  });

  return json({ ok: true });
};
