import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

const ATTR_PICKUP = "miko_pickup_method";
const ATTR_LOCATION_ID = "miko_location_id";
const ATTR_LOCATION_NAME = "miko_location_name";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "ORDERS_PAID") return json({ ok: true });

  const order = payload as {
    id: number;
    name: string;
    admin_graphql_api_id: string;
    note_attributes: Array<{ name: string; value: string }>;
    line_items: Array<{
      title: string;
      quantity: number;
      price: string;
      variant_title?: string;
      properties?: Array<{ name: string; value: string }>;
    }>;
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

  const attrs = new Map(order.note_attributes?.map((a) => [a.name, a.value]) ?? []);
  if (attrs.get(ATTR_PICKUP) !== "click_and_collect") return json({ ok: true });

  const locationId = attrs.get(ATTR_LOCATION_ID);
  if (!locationId) return json({ ok: true });

  const location = await db.pickupLocation.findFirst({ where: { id: locationId, shop } });
  if (!location) return json({ ok: true });

  const customerName = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ");
  const customerEmail = order.customer?.email ?? order.email ?? "";
  const customerPhone = order.customer?.phone ?? order.billing_address?.phone ?? order.phone ?? "";

  // Exclude internal service fee line — customer/merchant only sees real items
  const lineItems = (order.line_items ?? [])
    .filter(
      (li) =>
        !li.properties?.some(
          (p) => p.name === "_miko_service_fee_line" && p.value === "true",
        ),
    )
    .map((li) => ({
      title: li.variant_title ? `${li.title} - ${li.variant_title}` : li.title,
      quantity: li.quantity,
      price: li.price,
    }));

  await db.clickCollectOrder.upsert({
    where: {
      shop_shopifyOrderId: { shop, shopifyOrderId: String(order.id) },
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
      status: "confirmed",
      confirmedAt: new Date(),
    },
    update: {
      shopifyOrderName: order.name,
      customerName,
      customerEmail,
      customerPhone,
    },
  });

  // Tag the order in Shopify admin (idempotent -tagsAdd won't duplicate)
  const locationName = attrs.get(ATTR_LOCATION_NAME) ?? location.name;
  if (admin) {
    try {
      await admin.graphql(
        `mutation tagOrder($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            userErrors { field message }
          }
        }`,
        { variables: { id: order.admin_graphql_api_id, tags: ["click-collect", `pickup:${locationName}`] } },
      );

      await admin.graphql(
        `mutation addOrderNote($input: OrderInput!) {
          orderUpdate(input: $input) {
            userErrors { field message }
          }
        }`,
        {
          variables: {
            input: {
              id: order.admin_graphql_api_id,
              note: `CLICK & COLLECT - Pickup at: ${locationName}, ${[location.address, location.city, location.postcode].filter(Boolean).join(", ")}`,
            },
          },
        },
      );
    } catch (e) {
      console.error("Failed to tag order:", e);
    }
  }

  return json({ ok: true });
};
