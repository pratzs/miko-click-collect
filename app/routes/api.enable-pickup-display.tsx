import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { enablePickupOnProductPages } from "../utils/storefront-visibility.server";

/**
 * Turn Shopify's pickup block on for the merchant's product pages.
 *
 * Exists so the merchant never leaves the app to do it. The old flow was a
 * banner explaining which theme setting to find and a link to the theme
 * editor — three screens and a hunt, which is three chances to give up.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const result = await enablePickupOnProductPages(session.shop, session.accessToken ?? "");

  if (!result.ok) {
    console.error(`[enable-pickup-display] ${session.shop}: ${result.error}`);
    return json({ ok: false, message: result.error }, { status: 502 });
  }
  return json({
    ok: true,
    message: "Done. Your product pages now show pickup and the preparation time.",
  });
};
