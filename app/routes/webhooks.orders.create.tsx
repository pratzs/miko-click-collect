import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, admin } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE") return json({ ok: true });

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
    billing_address?: { phone?: string; first_name?: string; last_name?: string; name?: string };
    shipping_address?: { first_name?: string; last_name?: string; name?: string };
    email?: string;
    phone?: string;
  };

  // A pickup order carries no marker of ours at all. The only evidence is on
  // the order's fulfillment orders, which say PICK_UP and name the location the
  // shopper chose.
  let location = null as Awaited<ReturnType<typeof db.pickupLocation.findFirst>>;

  if (admin) {
    const shopifyLocationId = await findNativePickupLocationId(
      admin,
      order.admin_graphql_api_id,
    );
    if (shopifyLocationId) {
      location = await db.pickupLocation.findFirst({
        where: { shop, shopifyLocationId },
      });
      if (!location) {
        // Shopify handed the order to a location we do not have a pickup point
        // for. Loud on purpose: the merchant enabled pickup on a location
        // outside this app, and their customer is now waiting for a collection
        // email this app will never send.
        console.warn(
          `[orders/create] ${shop}: order ${order.name} is a native pickup at ` +
            `${shopifyLocationId}, which is not mapped to any pickup location in this app`,
        );
      }
    }
  }

  if (!location) return json({ ok: true });

  // Who is collecting. This is the field staff read out at the counter, so an
  // empty one is not cosmetic — verified on a real pickup order, where Shopify
  // sent no customer name at all and the dashboard showed a blank where the
  // name should be. Guest checkouts routinely carry the name only on an
  // address, so fall back through every place Shopify puts it.
  const nameFrom = (a?: { first_name?: string; last_name?: string; name?: string }) =>
    [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim() || (a?.name ?? "").trim();

  const customerName =
    nameFrom(order.customer) ||
    nameFrom(order.shipping_address) ||
    nameFrom(order.billing_address) ||
    "";
  const customerEmail = order.customer?.email ?? order.email ?? "";
  const customerPhone = order.customer?.phone ?? order.billing_address?.phone ?? order.phone ?? "";

  const lineItems = (order.line_items ?? []).map((li) => ({
      title: li.variant_title ? `${li.title} - ${li.variant_title}` : li.title,
    quantity: li.quantity,
    price: li.price,
    status: "confirmed",
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

  // Tag the order and add a note in Shopify admin so it's clearly a click & collect order
  const locationName = location.name;
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

/**
 * Is this order one of Shopify's own local pickup orders, and if so, which
 * Location is it being collected from?
 *
 * A native pickup order carries no attributes and no marker of ours. The
 * delivery method lives on the fulfillment orders, where `methodType` is
 * PICK_UP and `assignedLocation` is the store the customer chose.
 *
 * Returns null on any failure rather than throwing: a lookup problem must not
 * make the webhook fail and be retried forever.
 */
async function findNativePickupLocationId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orderGid: string,
): Promise<string | null> {
  if (!orderGid) return null;
  try {
    const res = await admin.graphql(
      `#graphql
      query PickupFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) {
            nodes {
              deliveryMethod { methodType }
              assignedLocation { location { id } }
            }
          }
        }
      }`,
      { variables: { id: orderGid } },
    );
    const data = await res.json();
    if (data?.errors) {
      console.error("[findNativePickupLocationId] GraphQL errors:", JSON.stringify(data.errors));
      return null;
    }
    const nodes = data?.data?.order?.fulfillmentOrders?.nodes ?? [];
    for (const node of nodes) {
      if (node?.deliveryMethod?.methodType === "PICK_UP") {
        return node?.assignedLocation?.location?.id ?? null;
      }
    }
    return null;
  } catch (err) {
    console.error("[findNativePickupLocationId] lookup failed:", err);
    return null;
  }
}

