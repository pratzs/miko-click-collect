/**
 * Is pickup actually visible to a shopper BEFORE they reach checkout?
 *
 * Why this exists
 * ---------------
 * Every serious click and collect retailer sells the promise on the product
 * page, not at checkout. Noel Leeming's whole pitch is "1hr FREE Click &
 * Collect if item is stocked", said before you add to cart, because a shopper
 * who does not know pickup exists never looks for it.
 *
 * Shopify renders exactly that natively once local pickup is on:
 *
 *     Pickup available at Shop location
 *     Usually ready in 24 hours
 *     View store information
 *
 * The catch, found by looking at a real storefront rather than reading docs:
 * whether it appears is up to the THEME, and themes disagree.
 *   - Dawn renders it unconditionally inside its product section.
 *   - Horizon has it as a `show_pickup_availability` setting on the buy-buttons
 *     block, and ships with it set to FALSE.
 * So on a brand new Horizon store the merchant switches pickup on, checkout
 * works perfectly, and every product page is silent about it. Nothing in
 * Shopify tells them, and no merchant goes looking for a theme setting they
 * have never heard of. Verified on a live store: flipping that one setting
 * produced the block above, with no other change.
 *
 * This check is deliberately CONSERVATIVE. It only reports "hidden" when it can
 * point at an explicit `false` in the published theme. A theme that never
 * mentions the setting (Dawn) is reported as unknown, never as broken, because
 * a false alarm telling a merchant their storefront is wrong when it is fine is
 * worse than staying quiet.
 */

const API_VERSION = "2026-04";

export type PickupVisibility =
  /** The theme explicitly has the pickup block switched OFF. Actionable. */
  | { state: "hidden"; themeId: string; themeName: string }
  /** Explicitly on. */
  | { state: "shown"; themeId: string; themeName: string }
  /** Theme does not expose the setting (e.g. Dawn renders it always), or we could not look. */
  | { state: "unknown" };

type ThemeFileNode = { filename: string; body?: { content?: string } };

export async function checkPickupVisibility(
  shop: string,
  accessToken: string,
): Promise<PickupVisibility> {
  try {
    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({
        query: `#graphql
          query PublishedThemeProductTemplate {
            themes(first: 1, roles: [MAIN]) {
              nodes {
                id
                name
                files(filenames: ["templates/product.json"], first: 1) {
                  nodes {
                    filename
                    body { ... on OnlineStoreThemeFileBodyText { content } }
                  }
                }
              }
            }
          }`,
      }),
    });
    if (!res.ok) return { state: "unknown" };

    const data = (await res.json()) as {
      data?: { themes?: { nodes?: Array<{ id: string; name: string; files?: { nodes?: ThemeFileNode[] } }> } };
      errors?: unknown;
    };
    if (data?.errors) {
      // Almost always a missing read_themes scope. Unknown, not hidden.
      console.warn("[checkPickupVisibility] GraphQL errors:", JSON.stringify(data.errors).slice(0, 200));
      return { state: "unknown" };
    }

    const theme = data?.data?.themes?.nodes?.[0];
    const content = theme?.files?.nodes?.[0]?.body?.content;
    if (!theme || !content) return { state: "unknown" };

    // Only two answers are honest here: we found the setting, or we did not.
    const on = /"show_pickup_availability"\s*:\s*true/i.test(content);
    const off = /"show_pickup_availability"\s*:\s*false/i.test(content);

    if (off && !on) return { state: "hidden", themeId: theme.id, themeName: theme.name };
    if (on) return { state: "shown", themeId: theme.id, themeName: theme.name };
    return { state: "unknown" };
  } catch (err) {
    console.error("[checkPickupVisibility] lookup failed:", err);
    return { state: "unknown" };
  }
}

/** Deep link straight to the product template in the theme editor. */
export function themeEditorProductUrl(shop: string, themeId: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  const numericId = themeId.split("/").pop();
  return `https://admin.shopify.com/store/${storeHandle}/themes/${numericId}/editor?template=product`;
}
