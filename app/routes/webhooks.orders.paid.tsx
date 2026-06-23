import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

// Attribute keys the checkout extension writes
const ATTR_PICKUP = "miko_pickup_method";       // "click_and_collect"
const ATTR_LOCATION_ID = "miko_location_id";   // our PickupLocation.id
const ATTR_LOCATION_NAME = "miko_location_name"; // display name

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") return json({ ok: true });

  const order = payload as {
    id: number;
    name: string;
    admin_graphql_api_id: string;
    note_attributes: Array<{ name: string; value: string }>;
    line_items: Array<{ title: string; quantity: number; price: string; variant_title?: string }>;
    total_price: string;
    currency: string;
    customer?: {
      first_name?: string;
      last_name?: string;
      email?: string;
      phone?: string;
    };
    billing_address?: { phone?: string };
    email?: string;
    phone?: string;
  };

  // Only process click & collect orders
  const attrs = new Map(order.note_attributes?.map((a) => [a.name, a.value]) ?? []);
  if (attrs.get(ATTR_PICKUP) !== "click_and_collect") return json({ ok: true });

  const locationId = attrs.get(ATTR_LOCATION_ID);
  if (!locationId) return json({ ok: true });

  // Verify location belongs to this shop
  const location = await db.pickupLocation.findFirst({ where: { id: locationId, shop } });
  if (!location) return json({ ok: true });

  const customerName = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ");
  const customerEmail = order.customer?.email ?? order.email ?? "";
  const customerPhone = order.customer?.phone ?? order.billing_address?.phone ?? order.phone ?? "";

  const lineItems = (order.line_items ?? []).map((li) => ({
    title: li.variant_title ? `${li.title} – ${li.variant_title}` : li.title,
    quantity: li.quantity,
    price: li.price,
  }));

  // Upsert — idempotent (webhook may fire more than once)
  await db.clickCollectOrder.upsert({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId: String(order.id),
      },
    },
    create: {
      shop,
      shopifyOrderId: String(order.id),
      shopifyOrderName: order.name,
      shopifyOrderGid: order.admin_graphql_api_id ?? "",
      pickupLocationId: location.id,
      customerName,
      customerEmail,
      customerPhone,
      lineItemsJson: lineItems,
      totalPrice: order.total_price ?? "",
      currency: order.currency ?? "",
      status: "pending",
    },
    update: {
      // If it already existed (duplicate webhook), don't reset status
      shopifyOrderName: order.name,
      customerName,
      customerEmail,
      customerPhone,
    },
  });

  return json({ ok: true });
};
