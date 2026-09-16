import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { recordNativePickupOrder } from "../utils/pickup-order.server";
import type { ShopifyOrderPayload } from "../utils/pickup-order.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE") return json({ ok: true });

  await recordNativePickupOrder({
    shop,
    admin,
    order: payload as ShopifyOrderPayload,
    source: "orders/create",
  });

  return json({ ok: true });
};
