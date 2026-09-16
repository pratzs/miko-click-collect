/**
 * What the merchant's Shopify plan actually lets this app do.
 *
 * Only ONE thing in Click and Collect is plan-gated: our checkout UI extension.
 * Shopify's docs are explicit — "Checkout UI extensions for the information,
 * shipping, and payment steps are available only to stores on a Shopify Plus
 * plan." On every other plan that extension simply never renders. No error, no
 * warning, nothing in the checkout editor: the merchant sets up pickup
 * locations and then finds a checkout that looks completely untouched.
 *
 * That silence is the reason this file exists. We ask Shopify what plan the
 * shop is on so the app can say plainly what will and will not appear at
 * checkout, and so the default setup is one that works everywhere.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type AdminLike = {
  graphql: (query: any, options?: any) => Promise<{ json: () => Promise<any> }>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type ShopPlan = {
  /** True when the checkout UI extension will actually render for this shop. */
  supportsCheckoutExtensions: boolean;
  /** e.g. "Basic", "Shopify", "Advanced", "Plus", "Plus Trial", "Development". */
  displayName: string;
  partnerDevelopment: boolean;
};

/**
 * "Plus Trial" reports `shopifyPlus: false` while behaving as Plus — a known,
 * still-open Shopify bug. Trusting the boolean alone tells a merchant on a Plus
 * trial that the checkout selector will not work for them, while it sits there
 * working. Development stores get checkout extensions too, which is why they
 * are in here as well: without that, the app would tell us our own test store
 * that its own feature is unavailable.
 */
const PLUS_DISPLAY_NAMES = new Set(["plus", "plus trial", "shopify plus", "development"]);

export async function fetchShopPlan(admin: AdminLike): Promise<ShopPlan | null> {
  try {
    const response = await admin.graphql(
      `#graphql
      query ShopPlanCapabilities {
        shop {
          plan {
            shopifyPlus
            displayName
            partnerDevelopment
          }
        }
      }`,
    );
    // Shopify returns GraphQL errors with HTTP 200, so this is the only place a
    // scope or field problem surfaces at all.
    const data = (await response.json()) as {
      data?: {
        shop?: {
          plan?: {
            shopifyPlus?: boolean;
            displayName?: string;
            partnerDevelopment?: boolean;
          };
        };
      };
      errors?: unknown;
    };
    if (data?.errors) {
      console.error("[fetchShopPlan] GraphQL errors:", JSON.stringify(data.errors));
      return null;
    }
    const plan = data?.data?.shop?.plan;
    if (!plan || typeof plan.shopifyPlus !== "boolean") {
      console.error("[fetchShopPlan] unexpected shape:", JSON.stringify(data).slice(0, 300));
      return null;
    }

    const displayName = plan.displayName ?? "";
    return {
      supportsCheckoutExtensions:
        plan.shopifyPlus || PLUS_DISPLAY_NAMES.has(displayName.trim().toLowerCase()),
      displayName,
      partnerDevelopment: plan.partnerDevelopment === true,
    };
  } catch (err) {
    // Returns null, never a made-up answer. Callers must treat null as "we do
    // not know" and stay quiet rather than warn a Plus merchant that their
    // checkout selector is about to fail.
    console.error("[fetchShopPlan] lookup failed:", err);
    return null;
  }
}
