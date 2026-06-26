import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CANCELLED") return json({ ok: true });

  const order = payload as { id: number };
  // Cancel from any pre-collection status — confirmed, processing, packing, or ready.
  // A "picked_up" order is already collected; we don't roll that back.
  await db.clickCollectOrder.updateMany({
    where: {
      shop,
      shopifyOrderId: String(order.id),
      status: { in: ["pending", "confirmed", "processing", "packing", "ready"] },
    },
    data: { status: "cancelled", cancelledAt: new Date() },
  });

  return json({ ok: true });
};
