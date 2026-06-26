import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { db } from "../db.server";

/**
 * Public beacon hit by the theme block on cart page load.
 * Used to detect whether the merchant has installed the cart-page theme block.
 *
 * GET /api/public/beacon?shop=<myshopify domain>&source=cart-block
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const source = url.searchParams.get("source") ?? "";

  if (
    shop &&
    source === "cart-block" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)
  ) {
    await db.shopConfig
      .update({
        where: { shop },
        data: { cartBlockLastSeenAt: new Date() },
      })
      .catch(() => null);
  }

  return json(
    { ok: true },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    },
  );
};
