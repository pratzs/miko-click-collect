import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * billing.request() always throws a redirect Response whose
 * X-Shopify-API-Request-Failure-Reauthorize-Url header carries
 * the Shopify billing confirmation URL. The client reads that
 * header and navigates window.top to it.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");

  if (!plan || !["starter", "growth"].includes(plan)) {
    return redirect("/app/pricing");
  }

  const shopHandle = session.shop.replace(".myshopify.com", "");
  const clientId = process.env.SHOPIFY_API_KEY || "f19e6148d0f330661fc2a3e5c70479d4";
  const returnUrl = `https://admin.shopify.com/store/${shopHandle}/apps/${clientId}/app/pricing`;

  try {
    await billing.request({
      plan,
      isTest: process.env.SHOPIFY_BILLING_TEST !== "false",
      returnUrl,
    });
  } catch (err: unknown) {
    if (err instanceof Response) throw err;
    console.error("[billing] unexpected error for", session.shop, err);
    throw err;
  }

  return redirect("/app/pricing");
};
