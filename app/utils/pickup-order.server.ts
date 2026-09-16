import { db } from "../db.server";

/**
 * Record a Shopify local pickup order against the pickup point it belongs to.
 *
 * Shared by orders/create and orders/paid on purpose. A native pickup order
 * carries no marker of ours at all — the only evidence is on the order's
 * fulfillment orders, where `methodType` is PICK_UP and `assignedLocation`
 * names the store the customer chose — and that evidence is not always there
 * the instant the order is created. If orders/create looks and finds nothing,
 * the order is dropped with no error anywhere, and the first anyone knows is a
 * customer at a counter that has no record of them. So orders/paid runs the
 * same check again a moment later as a second chance.
 *
 * Both paths are idempotent: the upsert is keyed on (shop, shopifyOrderId), and
 * whichever fires second only refreshes the contact details.
 */

export type ShopifyOrderPayload = {
  id: number;
  name: string;
  admin_graphql_api_id: string;
  line_items?: Array<{
    title: string;
    quantity: number;
    price: string;
    variant_title?: string;
  }>;
  total_price?: string;
  currency?: string;
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string };
  billing_address?: { phone?: string; first_name?: string; last_name?: string; name?: string };
  shipping_address?: { first_name?: string; last_name?: string; name?: string };
  email?: string;
  phone?: string;
};

/**
 * Is this order one of Shopify's own local pickup orders, and if so, which
 * Location is it being collected from?
 *
 * Returns null on any failure rather than throwing: a lookup problem must not
 * make the webhook fail and be retried forever.
 */
export async function findNativePickupLocationId(
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

/**
 * Who is collecting.
 *
 * This is the name staff read out at the counter, so an empty one is not
 * cosmetic — seen on a real pickup order, where Shopify sent no customer name
 * at all and the dashboard showed a blank where the name should be. Guest
 * checkouts routinely carry the name only on an address, and a pickup order has
 * no shipping address, so this falls through every place Shopify puts it.
 */
function customerNameFrom(order: ShopifyOrderPayload): string {
  const nameFrom = (a?: { first_name?: string; last_name?: string; name?: string }) =>
    [a?.first_name, a?.last_name].filter(Boolean).join(" ").trim() || (a?.name ?? "").trim();

  return (
    nameFrom(order.customer) ||
    nameFrom(order.shipping_address) ||
    nameFrom(order.billing_address) ||
    ""
  );
}

export async function recordNativePickupOrder({
  shop,
  admin,
  order,
  source,
}: {
  shop: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  order: ShopifyOrderPayload;
  source: string;
}): Promise<boolean> {
  if (!admin) return false;

  const shopifyLocationId = await findNativePickupLocationId(admin, order.admin_graphql_api_id);
  if (!shopifyLocationId) return false;

  const location = await db.pickupLocation.findFirst({ where: { shop, shopifyLocationId } });
  if (!location) {
    // Loud on purpose: the merchant enabled pickup on a location outside this
    // app, and their customer is now waiting for a collection email this app
    // will never send.
    console.warn(
      `[${source}] ${shop}: order ${order.name} is a native pickup at ` +
        `${shopifyLocationId}, which is not mapped to any pickup location in this app`,
    );
    return false;
  }

  const customerName = customerNameFrom(order);
  const customerEmail = order.customer?.email ?? order.email ?? "";
  const customerPhone = order.customer?.phone ?? order.billing_address?.phone ?? order.phone ?? "";

  const lineItems = (order.line_items ?? []).map((li) => ({
    title: li.variant_title ? `${li.title} - ${li.variant_title}` : li.title,
    quantity: li.quantity,
    price: li.price,
    status: "confirmed",
  }));

  await db.clickCollectOrder.upsert({
    where: { shop_shopifyOrderId: { shop, shopifyOrderId: String(order.id) } },
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

  await tagOrderInShopify({ admin, order, location });
  return true;
}

async function tagOrderInShopify({
  admin,
  order,
  location,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  order: ShopifyOrderPayload;
  location: { name: string; address: string; city: string; postcode: string };
}) {
  try {
    await admin.graphql(
      `mutation tagOrder($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) { userErrors { field message } }
      }`,
      {
        variables: {
          id: order.admin_graphql_api_id,
          tags: ["click-collect", `pickup:${location.name}`],
        },
      },
    );

    await admin.graphql(
      `mutation addOrderNote($input: OrderInput!) {
        orderUpdate(input: $input) { userErrors { field message } }
      }`,
      {
        variables: {
          input: {
            id: order.admin_graphql_api_id,
            note: `CLICK & COLLECT - Pickup at: ${location.name}, ${[
              location.address,
              location.city,
              location.postcode,
            ]
              .filter(Boolean)
              .join(", ")}`,
          },
        },
      },
    );
  } catch (e) {
    console.error("Failed to tag order:", e);
  }
}

/**
 * Fill in a name and phone that Shopify would not give us at the time.
 *
 * Customer name and phone are protected customer data. Until an app is granted
 * those fields, Shopify does not error — it quietly returns null, and the order
 * lands here with an empty name. The counter screen then shows a dash where the
 * collecting customer's name belongs, which on this particular screen is the
 * one field that matters.
 *
 * So rather than leave those orders blank forever, an order that is missing a
 * name asks Shopify once, when somebody actually opens it, and keeps what comes
 * back. One request, only on the orders that need it, and it stops needing it
 * the moment access is granted.
 */
export async function backfillCustomerContact({
  shop,
  admin,
  orderId,
  orderGid,
}: {
  shop: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  orderId: string;
  orderGid: string;
}): Promise<{ customerName: string; customerPhone: string } | null> {
  if (!admin || !orderGid) return null;
  try {
    const res = await admin.graphql(
      `#graphql
      query OrderContact($id: ID!) {
        order(id: $id) {
          phone
          customer { firstName lastName phone }
          billingAddress { firstName lastName name phone }
        }
      }`,
      { variables: { id: orderGid } },
    );
    const data = await res.json();
    if (data?.errors) return null;

    const o = data?.data?.order;
    if (!o) return null;

    const join = (a?: { firstName?: string | null; lastName?: string | null; name?: string | null }) =>
      [a?.firstName, a?.lastName].filter(Boolean).join(" ").trim() || (a?.name ?? "").trim();

    const customerName = join(o.customer) || join(o.billingAddress) || "";
    const customerPhone = o.customer?.phone ?? o.billingAddress?.phone ?? o.phone ?? "";

    // Still nothing to learn: access has not been granted yet, or this shopper
    // genuinely gave no name. Either way, do not write an empty string over an
    // empty string on every page view.
    if (!customerName && !customerPhone) return null;

    await db.clickCollectOrder.updateMany({
      where: { id: orderId, shop },
      data: {
        ...(customerName ? { customerName } : {}),
        ...(customerPhone ? { customerPhone } : {}),
      },
    });

    return { customerName, customerPhone };
  } catch (err) {
    console.error("[backfillCustomerContact] lookup failed:", err);
    return null;
  }
}
