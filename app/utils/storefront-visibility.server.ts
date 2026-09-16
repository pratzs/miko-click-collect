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

/**
 * Switch the theme's pickup block ON for the merchant.
 *
 * The app used to explain where the setting lived and send the merchant to the
 * theme editor to find it. That is a step, and every step is somewhere a
 * merchant stops: they installed a click and collect app, of course they want
 * pickup shown on their product pages. So the app does it.
 *
 * Narrow on purpose. It flips `show_pickup_availability` from false to true in
 * the published theme's product template and changes NOTHING else: same file,
 * same structure, one boolean. It never runs on its own — the merchant presses
 * a button — because silently rewriting a live theme is not ours to do.
 */
export async function enablePickupOnProductPages(
  shop: string,
  accessToken: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const current = await checkPickupVisibility(shop, accessToken);
    if (current.state === "shown") return { ok: true };
    if (current.state !== "hidden") {
      return { ok: false, error: "We could not find the pickup setting in your published theme." };
    }

    const read = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({
        query: `#graphql
          query ProductTemplate($id: ID!) {
            theme(id: $id) {
              files(filenames: ["templates/product.json"], first: 1) {
                nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
              }
            }
          }`,
        variables: { id: current.themeId },
      }),
    });
    const readJson = (await read.json()) as {
      data?: { theme?: { files?: { nodes?: Array<{ body?: { content?: string } }> } } };
    };
    const content = readJson?.data?.theme?.files?.nodes?.[0]?.body?.content;
    if (!content) return { ok: false, error: "We could not read your product template." };

    const updated = content.replace(
      /"show_pickup_availability"(\s*):(\s*)false/g,
      '"show_pickup_availability"$1:$2true',
    );
    if (updated === content) {
      return { ok: false, error: "The pickup setting was not where we expected in your theme." };
    }

    const write = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
      body: JSON.stringify({
        query: `#graphql
          mutation UpsertProductTemplate($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
            themeFilesUpsert(themeId: $themeId, files: $files) {
              userErrors { filename message }
            }
          }`,
        variables: {
          themeId: current.themeId,
          files: [{ filename: "templates/product.json", body: { type: "TEXT", value: updated } }],
        },
      }),
    });
    const writeJson = (await write.json()) as {
      data?: { themeFilesUpsert?: { userErrors?: Array<{ message: string }> } };
      errors?: Array<{ message: string }>;
    };
    if (writeJson?.errors?.length) {
      return { ok: false, error: writeJson.errors.map((e) => e.message).join("; ") };
    }
    const userErrors = writeJson?.data?.themeFilesUpsert?.userErrors ?? [];
    if (userErrors.length) return { ok: false, error: userErrors.map((e) => e.message).join("; ") };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
