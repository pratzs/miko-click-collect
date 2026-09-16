import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { recordNativePickupOrder } from "../utils/pickup-order.server";
import type { ShopifyOrderPayload } from "../utils/pickup-order.server";

/**
 * The second chance at catching a pickup order.
 *
 * This used to look for note attributes — miko_pickup_method, miko_location_id
 * — that the app wrote under the retired cart-and-rates design and has not
 * written since. Shopify's own local pickup orders carry no attributes at all,
 * so the very first line of this webhook returned early on every single order.
 * It has been doing nothing for as long as native pickup has been the design.
 *
 * Rather than delete it, it now does the job worth having: orders/create reads
 * the order's fulfillment orders to find the PICK_UP method, and that evidence
 * is not guaranteed to be there the instant an order is created. When it is
 * missing the order is dropped silently, and the first anyone hears of it is a
 * customer standing at a counter that has no record of them. Running the same
 * check again here catches that. The upsert is keyed on the Shopify order id,
 * so the common case — orders/create already got it — costs one lookup and
 * changes nothing.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") return json({ ok: true });

  const order = payload as ShopifyOrderPayload;

  // Already recorded by orders/create, which is the normal path.
  const existing = await db.clickCollectOrder.findFirst({
    where: { shop, shopifyOrderId: String(order.id) },
    select: { id: true },
  });
  if (existing) return json({ ok: true });

  const recorded = await recordNativePickupOrder({
    shop,
    admin,
    order,
    source: "orders/paid",
  });

  if (recorded) {
    console.warn(
      `[orders/paid] ${shop}: recovered pickup order ${order.name}, which orders/create did not record`,
    );
  }

  return json({ ok: true });
};
