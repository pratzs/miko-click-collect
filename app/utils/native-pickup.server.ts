/**
 * Native pickup: Click and Collect driven by Shopify's OWN local pickup.
 *
 * Why this exists
 * ---------------
 * Our checkout UI extension renders the pickup selector inside checkout, which
 * is by far the best experience — and it is Shopify Plus only. On every other
 * plan it silently never renders, so the merchant's only remaining option was
 * our cart-page theme block, which they must install themselves and which any
 * dynamic checkout button (Buy Now, Shop Pay, PayPal) skips entirely.
 *
 * Shopify's own local pickup has none of those problems. It is available on all
 * plans, the pickup option and the location list are drawn by Shopify inside
 * checkout, there is nothing to install in the theme, and nothing can bypass
 * it. It is switched on per Shopify LOCATION through the Admin API, which is
 * all this module does.
 *
 * What we give up, stated plainly so nobody rediscovers it the hard way:
 *
 *   - No pickup fee. Charging for local pickup needs the Local Pickup Charges
 *     function, and that API is restricted to CUSTOM apps on Shopify Plus —
 *     public App Store apps are explicitly not eligible. Merchants who must
 *     charge a pickup fee have to use "rates" mode.
 *   - Prep time is a fixed Shopify enum (1h, 2h, 4h, 24h, 2-4 days, 5+ days),
 *     so our per-minute prep time is rounded to the nearest one. Our own
 *     emails and dashboard keep the exact figure.
 *   - Shopify only offers a pickup location when the cart can actually be
 *     supplied there: in stock at that location, transferable to it, or the
 *     variant's inventory is untracked / allowed to oversell.
 */
import { db } from "../db.server";
import { prepTimeToPickupTime } from "./pickup-time";

const API_VERSION = "2026-04";

type GraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLResponse<T>> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`Shopify API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as GraphQLResponse<T>;
}

// ─── Shopify locations ──────────────────────────────────────────────────────

export type ShopifyLocation = {
  id: string;
  name: string;
  isActive: boolean;
  fulfillsOnlineOrders: boolean;
  address: string;
  localPickupEnabled: boolean;
  pickupTime: string | null;
};

type LocationNode = {
  id: string;
  name: string;
  isActive: boolean;
  fulfillsOnlineOrders: boolean;
  address?: {
    address1?: string | null;
    city?: string | null;
    zip?: string | null;
  } | null;
  localPickupSettingsV2?: { pickupTime?: string | null; instructions?: string | null } | null;
};

/**
 * Every location in the store, with its current local pickup state read from
 * Shopify rather than from our own mirror — the locations screen must show what
 * the merchant would see in Shopify admin, not what we last intended.
 */
export async function listShopifyLocations(
  shop: string,
  accessToken: string,
): Promise<ShopifyLocation[]> {
  const res = await shopifyGraphql<{ locations: { nodes: LocationNode[] } }>(
    shop,
    accessToken,
    `#graphql
    query PickupLocations {
      locations(first: 100, includeInactive: false) {
        nodes {
          id
          name
          isActive
          fulfillsOnlineOrders
          address { address1 city zip }
          localPickupSettingsV2 { pickupTime instructions }
        }
      }
    }`,
  );
  if (res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  return (res.data?.locations?.nodes ?? []).map((node) => ({
    id: node.id,
    name: node.name,
    isActive: node.isActive,
    fulfillsOnlineOrders: node.fulfillsOnlineOrders,
    address: [node.address?.address1, node.address?.city, node.address?.zip]
      .filter(Boolean)
      .join(", "),
    localPickupEnabled: Boolean(node.localPickupSettingsV2),
    pickupTime: node.localPickupSettingsV2?.pickupTime ?? null,
  }));
}

export async function enableLocalPickup(
  shop: string,
  accessToken: string,
  locationId: string,
  opts: { pickupTime: string; instructions: string },
): Promise<void> {
  const res = await shopifyGraphql<{
    locationLocalPickupEnable: {
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(
    shop,
    accessToken,
    `#graphql
    mutation EnableLocalPickup($localPickupSettings: DeliveryLocationLocalPickupEnableInput!) {
      locationLocalPickupEnable(localPickupSettings: $localPickupSettings) {
        localPickupSettings { pickupTime instructions }
        userErrors { field message }
      }
    }`,
    {
      localPickupSettings: {
        locationId,
        pickupTime: opts.pickupTime,
        // Shopify shows this to the customer under the pickup option. Empty
        // string is rejected as a value, so omit the key entirely when blank.
        ...(opts.instructions ? { instructions: opts.instructions } : {}),
      },
    },
  );
  if (res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const userErrors = res.data?.locationLocalPickupEnable?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join("; "));
  }
}

export async function disableLocalPickup(
  shop: string,
  accessToken: string,
  locationId: string,
): Promise<void> {
  const res = await shopifyGraphql<{
    locationLocalPickupDisable: {
      userErrors: Array<{ field?: string[]; message: string }>;
    };
  }>(
    shop,
    accessToken,
    `#graphql
    mutation DisableLocalPickup($locationId: ID!) {
      locationLocalPickupDisable(locationId: $locationId) {
        locationId
        userErrors { field message }
      }
    }`,
    { locationId },
  );
  if (res.errors?.length) {
    throw new Error(res.errors.map((e) => e.message).join("; "));
  }
  const userErrors = res.data?.locationLocalPickupDisable?.userErrors ?? [];
  if (userErrors.length) {
    throw new Error(userErrors.map((e) => e.message).join("; "));
  }
}

// ─── Sync ───────────────────────────────────────────────────────────────────

export type NativePickupSyncResult = {
  enabled: number;
  disabled: number;
  /** Active pickup points with no Shopify location mapped — invisible at checkout. */
  unmapped: string[];
  failures: Array<{ location: string; error: string }>;
};

/**
 * Make Shopify's local pickup match our pickup locations.
 *
 * Enables pickup on every active pickup point that is mapped to a Shopify
 * location, and disables it on ones we previously enabled and that are now
 * inactive or unmapped.
 *
 * Deliberately narrow on the disable side: it only ever turns off a location
 * this app turned ON (`localPickupEnabled` in our own record). A merchant may
 * well have local pickup configured on locations that have nothing to do with
 * this app, and silently switching those off would change how their store takes
 * orders.
 */
export async function syncNativePickup(
  shop: string,
  accessToken: string,
): Promise<NativePickupSyncResult> {
  const result: NativePickupSyncResult = {
    enabled: 0,
    disabled: 0,
    unmapped: [],
    failures: [],
  };

  const locations = await db.pickupLocation.findMany({ where: { shop } });

  for (const loc of locations) {
    const shouldBeOn = loc.isActive && Boolean(loc.shopifyLocationId);

    if (loc.isActive && !loc.shopifyLocationId) {
      result.unmapped.push(loc.name);
    }

    try {
      if (shouldBeOn) {
        await enableLocalPickup(shop, accessToken, loc.shopifyLocationId, {
          pickupTime: prepTimeToPickupTime(loc.prepTimeMinutes),
          instructions: loc.collectionInstructions,
        });
        if (!loc.localPickupEnabled) {
          await db.pickupLocation.update({
            where: { id: loc.id },
            data: { localPickupEnabled: true },
          });
        }
        result.enabled += 1;
      } else if (loc.localPickupEnabled && loc.shopifyLocationId) {
        await disableLocalPickup(shop, accessToken, loc.shopifyLocationId);
        await db.pickupLocation.update({
          where: { id: loc.id },
          data: { localPickupEnabled: false },
        });
        result.disabled += 1;
      }
    } catch (err) {
      result.failures.push({
        location: loc.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
