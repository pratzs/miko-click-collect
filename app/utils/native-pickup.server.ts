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
  /**
   * Whether Shopify can actually place this location on a map.
   *
   * Shopify's pickup picker is a proximity search — it asks "which locations
   * near the buyer have this item". A location with no street address never
   * gets geocoded, so it has no coordinates, so it matches nobody: the customer
   * sees "No locations in <country> with your item" even though pickup is
   * switched on and the item is in stock there. Verified on a live store: a
   * location with only a country set produced exactly that, and Shopify's own
   * settings page still showed it as "Offers pickup".
   */
  hasMappableAddress: boolean;
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
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  localPickupSettingsV2?: { pickupTime?: string | null; instructions?: string | null } | null;
};

/**
 * Every location in the store, with its current local pickup state read from
 * Shopify rather than from our own mirror — the locations screen must show what
 * the merchant would see in Shopify admin, not what we last intended.
 *
 * Paged, because "every" has to mean every. This asked for the first 100 and
 * took whatever came back, which is fine for a single shop and wrong for the
 * chains this app is sold to: a retailer with more than 100 stores would have
 * had the rest silently dropped, so locations past the hundredth would never be
 * offered for import, never have pickup switched on, and never appear at
 * checkout — with nothing anywhere saying why.
 */
export async function listShopifyLocations(
  shop: string,
  accessToken: string,
): Promise<ShopifyLocation[]> {
  const nodes: LocationNode[] = [];
  let cursor: string | null = null;

  // A stop that cannot be hit by a real store, so a bad cursor cannot spin
  // forever against Shopify's API.
  for (let pages = 0; pages < 50; pages++) {
    const res: Awaited<ReturnType<typeof shopifyGraphql<{
      locations: { nodes: LocationNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
    }>>> = await shopifyGraphql(
      shop,
      accessToken,
      `#graphql
      query PickupLocations($after: String) {
        locations(first: 250, includeInactive: false, after: $after) {
          nodes {
            id
            name
            isActive
            fulfillsOnlineOrders
            address { address1 city zip latitude longitude }
            localPickupSettingsV2 { pickupTime instructions }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor },
    );
    if (res.errors?.length) {
      throw new Error(res.errors.map((e) => e.message).join("; "));
    }
    nodes.push(...(res.data?.locations?.nodes ?? []));
    const pageInfo = res.data?.locations?.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    cursor = pageInfo.endCursor;
  }

  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    isActive: node.isActive,
    fulfillsOnlineOrders: node.fulfillsOnlineOrders,
    address: [node.address?.address1, node.address?.city, node.address?.zip]
      .filter(Boolean)
      .join(", "),
    localPickupEnabled: Boolean(node.localPickupSettingsV2),
    pickupTime: node.localPickupSettingsV2?.pickupTime ?? null,
    // Coordinates are what the proximity search actually uses; the street
    // address is checked too so we can tell the merchant what to go and fix.
    hasMappableAddress:
      Boolean(node.address?.address1) &&
      node.address?.latitude != null &&
      node.address?.longitude != null,
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
  /**
   * Mapped, enabled, and STILL invisible to customers because the Shopify
   * location has no usable street address, so Shopify can't place it on a map
   * and its proximity search never returns it.
   */
  addressless: string[];
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
    addressless: [],
    failures: [],
  };

  const locations = await db.pickupLocation.findMany({ where: { shop } });

  // Read the store's locations once so we can tell the merchant when pickup is
  // switched on but still cannot reach a customer. Non-fatal: if this lookup
  // fails we still do the real work, we just cannot warn about addresses.
  let shopifyLocations: ShopifyLocation[] = [];
  try {
    shopifyLocations = await listShopifyLocations(shop, accessToken);
  } catch (err) {
    console.warn("[syncNativePickup] address check skipped:", err);
  }

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

        const shopifyLocation = shopifyLocations.find((l) => l.id === loc.shopifyLocationId);
        if (shopifyLocation && !shopifyLocation.hasMappableAddress) {
          result.addressless.push(loc.name);
        }
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
