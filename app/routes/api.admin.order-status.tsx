import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const orderGid = url.searchParams.get("orderGid");

  if (!orderGid) {
    return json({ error: "Missing orderGid" }, { status: 400 });
  }

  const order = await db.clickCollectOrder.findFirst({
    where: { shopifyOrderGid: orderGid },
    include: { pickupLocation: true },
  });

  if (!order) {
    return json({ error: "Not a click & collect order" }, { status: 404, headers: corsHeaders() });
  }

  return json({
    order: {
      id: order.id,
      status: order.status,
      locationName: order.pickupLocation.name,
      locationAddress: [order.pickupLocation.address, order.pickupLocation.city, order.pickupLocation.postcode]
        .filter(Boolean)
        .join(", "),
      readyAt: order.readyAt?.toISOString() ?? null,
      pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    },
  }, { headers: corsHeaders() });
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://admin.shopify.com",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
