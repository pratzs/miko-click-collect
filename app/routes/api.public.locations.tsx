import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";

// Public endpoint — called by the Checkout UI Extension (no auth required, CORS open)
// GET /api/public/locations?shop=mystore.myshopify.com
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ locations: [] }, {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  const locations = await db.pickupLocation.findMany({
    where: { shop, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      postcode: true,
      phone: true,
      hours: true,
      prepTimeMinutes: true,
      collectionInstructions: true,
      serviceFeeType: true,
      serviceFeeAmount: true,
      serviceFeeFreeAbove: true,
      serviceFeeLabel: true,
    },
  });

  return json(
    { locations },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  return json({}, { headers: { "Access-Control-Allow-Origin": "*" } });
};
