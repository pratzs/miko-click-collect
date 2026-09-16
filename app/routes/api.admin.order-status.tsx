import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { parseLineItems } from "../utils/status";

/**
 * Order state for the admin order-details extensions.
 *
 * This endpoint is called from inside the Shopify admin, which means it is
 * called from a DIFFERENT ORIGIN to this app, which is why it needs CORS. It
 * does NOT mean it is public. It briefly was, and the consequences were as bad
 * as they sound: no authentication and no shop scoping, so an anonymous request
 * carrying nothing but an order's GID got back that order's contents, the
 * pickup address, and the internal id needed to drive /api/admin/order-action.
 * Verified against production before the fix — a shell with no credentials read
 * a different merchant's order in full. Order GIDs are sequential integers.
 *
 * Both halves of that matter and both are enforced below:
 *   - authenticate.admin rejects anything without a valid Shopify session
 *     token, so a caller must be a signed-in staff member of an installed shop;
 *   - the lookup is scoped to session.shop, so being a valid staff member of
 *     ONE store does not let you read another store's orders.
 */

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Preflight carries no Authorization header by definition, so it has to be
  // answered before authentication. It discloses nothing.
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  const { session, cors } = await authenticate.admin(request);

  const url = new URL(request.url);
  const orderGid = url.searchParams.get("orderGid");

  if (!orderGid) {
    return cors(json({ error: "Missing orderGid" }, { status: 400 }));
  }

  const gid = orderGid.startsWith("gid://")
    ? orderGid
    : `gid://shopify/Order/${orderGid}`;

  const order = await db.clickCollectOrder.findFirst({
    where: { shop: session.shop, shopifyOrderGid: gid },
    include: { pickupLocation: true, shopConfig: true },
  });

  if (!order) {
    return cors(json({ error: "Not a click & collect order" }, { status: 404 }));
  }

  const lineItems = parseLineItems(order.lineItemsJson);

  return cors(
    json({
      order: {
        id: order.id,
        status: order.status,
        locationName: order.pickupLocation.name,
        locationAddress: [order.pickupLocation.address, order.pickupLocation.city, order.pickupLocation.postcode]
          .filter(Boolean)
          .join(", "),
        readyAt: order.readyAt?.toISOString() ?? null,
        pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
        useProcessingStep: order.shopConfig.useProcessingStep,
        usePackingStep: order.shopConfig.usePackingStep,
        lineItems,
      },
    }),
  );
};
