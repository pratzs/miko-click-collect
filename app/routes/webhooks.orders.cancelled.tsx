import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CANCELLED") return json({ ok: true });

  const order = payload as { id: number };
  await db.clickCollectOrder.updateMany({
    where: { shop, shopifyOrderId: String(order.id), status: { in: ["pending", "ready"] } },
    data: { status: "cancelled" },
  });

  return json({ ok: true });
};
