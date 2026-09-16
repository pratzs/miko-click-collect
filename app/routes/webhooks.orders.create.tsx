import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

const ATTR_PICKUP = "miko_pickup_method";
const ATTR_LOCATION_ID = "miko_location_id";
const ATTR_LOCATION_NAME = "miko_location_name";

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
    billing_address?: { phone?: string };
    email?: string;
    phone?: string;
  };

  const attrs = new Map(order.note_attributes?.map((a) => [a.name, a.value]) ?? []);

  // Two ways an order can be a pickup order, because there are two ways the
  // customer can choose one.
  //
  //   "rates" mode  — our cart block or checkout extension wrote the pickup
  //     attributes onto the cart, and they arrive here as note_attributes.
  //   "native" mode — the customer used SHOPIFY's own pickup option inside
  //     checkout. There are no attributes at all; the only evidence is on the
  //     order's fulfillment orders, which say PICK_UP and name the location.
  //
  // Both are checked on every order rather than branching on the shop's
  // configured mode: a merchant who switches modes still has in-flight
  // checkouts started under the old one, and those orders must not vanish.
  let location = null as Awaited<ReturnType<typeof db.pickupLocation.findFirst>>;

  if (attrs.get(ATTR_PICKUP) === "click_and_collect") {
    const locationId = attrs.get(ATTR_LOCATION_ID);
    if (locationId) {
      location = await db.pickupLocation.findFirst({ where: { id: locationId, shop } });
    }
  }

  if (!location && admin) {
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

  const customerName = [order.customer?.first_name, order.customer?.last_name]
    .filter(Boolean)
    .join(" ");
  const customerEmail = order.customer?.email ?? order.email ?? "";
  const customerPhone = order.customer?.phone ?? order.billing_address?.phone ?? order.phone ?? "";

  // Exclude our internal service fee line from the merchant-facing list —
  // it's an automated charge, not something the merchant needs to pack
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

      // Auto-fulfill any service fee line item — it's a virtual fee, not a
      // physical product, so the merchant shouldn't have to click "Mark as
      // fulfilled" on it. Query fulfillment orders and fulfill the one
      // containing the line tagged with _miko_service_fee_line.
      await autoFulfillServiceFeeLine(admin, order.admin_graphql_api_id);
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

async function autoFulfillServiceFeeLine(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orderGid: string,
) {
  // Find the fulfillment order(s) that contain our service fee line item
  const res = await admin.graphql(
    `query($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 10) {
          nodes {
            id
            status
            lineItems(first: 50) {
              nodes {
                id
                lineItem {
                  id
                  customAttributes { key value }
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: orderGid } },
  );
  const data = await res.json();
  const fulfillmentOrders = data?.data?.order?.fulfillmentOrders?.nodes ?? [];

  for (const fo of fulfillmentOrders) {
    if (fo.status === "CLOSED") continue;

    const feeLineItems = (fo.lineItems?.nodes ?? []).filter(
      (foli: { lineItem: { customAttributes: Array<{ key: string; value: string }> } }) =>
        foli.lineItem?.customAttributes?.some(
          (a) => a.key === "_miko_service_fee_line" && a.value === "true",
        ),
    );
    if (feeLineItems.length === 0) continue;

    // Fulfill only fulfillment orders that consist ENTIRELY of our fee line
    // (otherwise we'd auto-fulfill the real product the merchant needs to pack)
    const allLines = fo.lineItems?.nodes ?? [];
    if (feeLineItems.length !== allLines.length) continue;

    try {
      await admin.graphql(
        `mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id }
            userErrors { message }
          }
        }`,
        {
          variables: {
            fulfillment: {
              lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id }],
              notifyCustomer: false,
            },
          },
        },
      );
    } catch (err) {
      console.error("Auto-fulfill service fee line failed:", err);
    }
  }
}
