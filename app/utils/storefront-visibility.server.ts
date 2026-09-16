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

/**
 * Remember the answer when there is nothing to say.
 *
 * This asks Shopify for the published theme's product template, and the
 * dashboard asks it on every single page load. For a shop whose staff keep the
 * app open all day that is a live Admin API call, fetching a file that can run
 * to hundreds of kilobytes, to re-learn something that changes only when
 * somebody edits their theme.
 *
 * Only the quiet answers are cached. A "hidden" result is the one the merchant
 * is being asked to go and fix, so it is always re-checked: nothing feels more
 * broken than doing what a banner told you and having the banner stay put.
 */
const CACHE_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; result: PickupVisibility }>();

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
  const cached = cache.get(shop);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const result = await lookUpPickupVisibility(shop, accessToken);
  if (result.state !== "hidden") cache.set(shop, { at: Date.now(), result });
  return result;
}

async function lookUpPickupVisibility(
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

/**
 * One click that switches our pickup block on, rather than a scavenger hunt.
 *
 * The app cannot do this for the merchant, and that is not for want of trying.
 * It briefly shipped a button that edited the theme itself, which worked when
 * tested with a merchant's own token and then failed with the app's:
 *
 *   Access denied for themeFilesUpsert field. Required access: The user needs
 *   write_themes AND AN EXEMPTION FROM SHOPIFY to modify theme files.
 *
 * So theme files are closed to public apps, `write_themes` alone buys nothing,
 * and the scope was dropped rather than asking merchants for a permission the
 * app cannot use. What Shopify does allow is this deep link: it opens the theme
 * editor with our app embed already selected, so the merchant toggles it on and
 * hits Save. Two clicks, from a button inside our app, instead of hunting for a
 * theme setting they have never heard of.
 *
 * The id in `activateAppId` is the app's API key — the same value as `client_id`
 * in shopify.app.toml — NOT the extension uid the CLI writes into the
 * extension's own toml. Shopify's docs are explicit that the UUID form is
 * deprecated. Getting this wrong fails silently: the editor opens, drops the
 * parameter, and activates nothing.
 */
export function enablePickupBlockUrl(shop: string, apiKey: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  // The app BLOCK, dropped into the product template's main section, rather
  // than the app embed. An embed renders at the end of <body> and Shopify
  // documents it as having "only the Global Liquid scope", which leaves it
  // genuinely unclear whether `product` is in scope there — and a pickup block
  // that cannot see the product is worth nothing. An app block placed in the
  // product section has no such doubt, and it lands next to the buy button
  // instead of having to be moved there by script.
  return (
    `https://admin.shopify.com/store/${storeHandle}/themes/current/editor` +
    `?template=product&addAppBlockId=${apiKey}/pickup-availability&target=mainSection`
  );
}

/**
 * The theme's OWN pickup setting, for merchants who would rather use that than
 * our block. Kept because a merchant already running Dawn has pickup showing
 * natively and does not need anything from us.
 */
export function themeEditorProductUrl(shop: string, themeId: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  const numericId = themeId.split("/").pop();
  return `https://admin.shopify.com/store/${storeHandle}/themes/${numericId}/editor?template=product`;
}
