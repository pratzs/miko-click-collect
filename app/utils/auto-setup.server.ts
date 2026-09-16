/**
 * Setup for Miko Click and Collect.
 *
 * There is ONE way this app does pickup: Shopify's own local pickup, switched
 * on for the locations the merchant links. That works on every plan, the pickup
 * option and the store list are drawn by Shopify inside checkout, there is
 * nothing to add to the theme and nothing for a Buy Now button to skip.
 *
 * What this file deliberately no longer does
 * ------------------------------------------
 * An earlier design also offered a "rates" mode: a per-location shipping rate
 * for every pickup point, a delivery-customisation Function to hide the wrong
 * ones, and a "Click and Collect Service Fee" PRODUCT added to the cart to
 * charge for collection.
 *
 * That is gone, on Pratham's call, and it was the right call. Verified on a live
 * storefront: the fee product had its own public product page with an Add to
 * cart button and appeared in /collections/all and in "You may also like" - the
 * app's own plumbing was for sale in the merchant's shop. It also left
 * "Click and Collect - <location>" entries in their delivery settings. None of
 * that is tidy, and a merchant should not have to understand any of it.
 *
 * The one thing lost with it is charging for pickup. That is not recoverable
 * anyway: the Local Pickup Charges function is restricted to CUSTOM apps on
 * Shopify Plus, and public App Store apps are explicitly not eligible. Shopify's
 * native pickup is always free. Say so plainly rather than faking it with a
 * product line.
 *
 * So setup is now: sync local pickup, and clean up anything the old design left
 * behind in the merchant's store.
 */

import { db } from "../db.server";
import { syncNativePickup } from "./native-pickup.server";

const API_VERSION = "2026-04";
const RATE_PREFIX = "Click and Collect"; // legacy rate titles, cleaned up below

type ShopifyGraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

type DeliveryProfileShape = {
  id: string;
  default: boolean;
  profileLocationGroups: Array<{
    locationGroup: { id: string };
    locationGroupZones: {
      nodes: Array<{
        zone: { id: string; name: string };
        methodDefinitions: {
          nodes: Array<{ id: string; name: string }>;
        };
      }>;
    };
  }>;
};

async function shopifyGraphql<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<ShopifyGraphQLResponse<T>> {
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  return (await res.json()) as ShopifyGraphQLResponse<T>;
}

async function fetchPrimaryDeliveryProfile(shop: string, accessToken: string): Promise<DeliveryProfileShape> {
  const res = await shopifyGraphql<{ deliveryProfiles: { nodes: DeliveryProfileShape[] } }>(
    shop,
    accessToken,
    `{
      deliveryProfiles(first: 10) {
        nodes {
          id
          default
          profileLocationGroups {
            locationGroup { id }
            locationGroupZones(first: 25) {
              nodes {
                zone { id name }
                methodDefinitions(first: 100) { nodes { id name } }
              }
            }
          }
        }
      }
    }`,
  );

  const profiles = res.data?.deliveryProfiles?.nodes ?? [];
  const profile =
    profiles.find((p) => p.default && p.profileLocationGroups?.length > 0) ??
    profiles.find((p) => p.profileLocationGroups?.length > 0);

  if (!profile) {
    throw new Error(
      "This store has no shipping zones. Add at least one zone in Shopify Admin → Settings → Shipping and delivery → Manage rates, then re-run setup.",
    );
  }
  return profile;
}

/**
 * Delete one legacy "Click and Collect - ..." delivery rate.
 *
 * `methodDefinitionsToDelete` is a TOP-LEVEL field on DeliveryProfileInput. The
 * first version nested it inside zonesToUpdate, where it does not exist, so
 * every delete failed validation. That was invisible because the call was
 * wrapped in `.catch(() => null)` and userErrors were never read: cleanup
 * reported success, forgot the rate, and a real checkout went on offering
 * "Click and Collect - Office" afterwards.
 *
 * So this throws on transport errors AND on userErrors. A delete that cannot
 * confirm the delete must say so.
 */
async function deleteRate(shop: string, accessToken: string, rateId: string) {
  if (!rateId) return;

  const res = await shopifyGraphql<{
    deliveryProfileUpdate: { userErrors: Array<{ message: string }> };
  }>(
    shop,
    accessToken,
    `mutation deleteRate($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        userErrors { message }
      }
    }`,
    {
      id: (await fetchPrimaryDeliveryProfile(shop, accessToken)).id,
      profile: { methodDefinitionsToDelete: [rateId] },
    },
  );
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join("; "));
  const userErrors = res.data?.deliveryProfileUpdate?.userErrors ?? [];
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
}

async function retireServiceFeeProduct(shop: string, accessToken: string, productId: string) {
  if (!productId) return;

  const pubRes = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string }> };
  }>(shop, accessToken, `{ publications(first: 25) { nodes { id } } }`);
  const publications = pubRes.data?.publications?.nodes ?? [];

  if (publications.length > 0) {
    await shopifyGraphql(
      shop,
      accessToken,
      `mutation publishableUnpublish($id: ID!, $input: [PublicationInput!]!) {
        publishableUnpublish(id: $id, input: $input) { userErrors { message } }
      }`,
      { id: productId, input: publications.map((p) => ({ publicationId: p.id })) },
    );
  }

  await shopifyGraphql(
    shop,
    accessToken,
    `mutation archiveFeeProduct($input: ProductInput!) {
      productUpdate(input: $input) { userErrors { message } }
    }`,
    { input: { id: productId, status: "ARCHIVED" } },
  );
}

/* ===== One-time cleanup of the retired "rates" design ===== */

/**
 * Remove everything the old rates mode put in the merchant's store.
 *
 * Runs on every setup, is idempotent, and never touches anything the merchant
 * made themselves: rates are matched on the exact "Click and Collect - " prefix
 * this app used to create, and the fee product is matched by the id we stored.
 *
 * Returns a human sentence per thing removed so the merchant can see what
 * changed in their store rather than having it happen silently.
 */
async function cleanUpLegacyArtefacts(
  shop: string,
  accessToken: string,
  serviceFeeProductId: string,
): Promise<string[]> {
  const removed: string[] = [];

  if (serviceFeeProductId) {
    try {
      await retireServiceFeeProduct(shop, accessToken, serviceFeeProductId);
      removed.push("Removed the Click and Collect Service Fee product from your storefront");
      await db.shopConfig.update({
        where: { shop },
        data: { serviceFeeProductId: "", serviceFeeVariantId: "" },
      });
    } catch (err) {
      console.warn("[cleanup] fee product:", err);
    }
  }

  try {
    const profile = await fetchPrimaryDeliveryProfile(shop, accessToken);
    const stale: Array<{ id: string; name: string }> = [];
    for (const lg of profile.profileLocationGroups) {
      for (const zone of lg.locationGroupZones.nodes) {
        for (const m of zone.methodDefinitions.nodes) {
          if ((m.name ?? "").startsWith(RATE_PREFIX + " - ")) stale.push({ id: m.id, name: m.name });
        }
      }
    }

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const rate of stale) {
      try {
        await deleteRate(shop, accessToken, rate.id);
        deleted.push(rate.id);
      } catch (err) {
        failed.push(`${rate.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (deleted.length) {
      removed.push(
        `Removed ${deleted.length} old "${RATE_PREFIX} - ..." delivery ${deleted.length === 1 ? "rate" : "rates"} from your shipping settings`,
      );
      // Only forget the ones Shopify actually accepted a delete for. Clearing
      // every row regardless is how the old version lost track of a rate that
      // was still live at checkout.
      await db.pickupLocation.updateMany({
        where: { shop, shopifyRateId: { in: deleted } },
        data: { shopifyRateId: "" },
      });
    }
    if (failed.length) {
      throw new Error(
        `Could not remove ${failed.length} old delivery ${failed.length === 1 ? "rate" : "rates"}: ${failed.join(" | ")}. Delete them in Settings then Shipping and delivery so customers do not see them.`,
      );
    }
  } catch (err) {
    console.warn("[cleanup] legacy rates:", err);
    throw err;
  }

  return removed;
}

/* ===== Orchestrator ===== */

export type SetupStep = { ok: boolean; error?: string; count?: number };

export type SetupResult = {
  ok: boolean;
  steps: Record<string, SetupStep>;
  /** Things removed from the merchant's store, shown to them once. */
  cleanedUp: string[];
};

export async function runAutoSetup(shop: string, accessToken: string): Promise<SetupResult> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config) {
    return { ok: false, steps: { config: { ok: false, error: "Shop config missing" } }, cleanedUp: [] };
  }

  const result: SetupResult = { ok: true, steps: { pickup: { ok: false } }, cleanedUp: [] };

  try {
    result.cleanedUp = await cleanUpLegacyArtefacts(shop, accessToken, config.serviceFeeProductId);
  } catch (e) {
    result.ok = false;
    result.steps.cleanup = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const sync = await syncNativePickup(shop, accessToken);
    const problems: string[] = sync.failures.map((f) => `${f.location}: ${f.error}`);
    if (sync.unmapped.length) {
      problems.push(
        `Not shown at checkout until linked to a Shopify location: ${sync.unmapped.join(", ")}`,
      );
    }
    if (sync.addressless.length) {
      problems.push(
        `Pickup is on for ${sync.addressless.join(", ")}, but the Shopify location has no street address, so Shopify cannot offer it to customers. Add the address in Settings then Locations.`,
      );
    }
    result.steps.pickup = problems.length
      ? { ok: false, count: sync.enabled, error: problems.join(" | ") }
      : { ok: true, count: sync.enabled };
    // &&=, not =. Assigning here once wiped out a cleanup failure recorded a few
    // lines earlier and reported the whole setup as ok.
    result.ok = result.ok && problems.length === 0;
  } catch (e) {
    result.ok = false;
    result.steps.pickup = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const errorSummary = Object.entries(result.steps)
    .filter(([, v]) => !v.ok)
    .map(([k, v]) => `${k}: ${v.error}`)
    .join(" | ");

  await db.shopConfig.update({
    where: { shop },
    data: { setupCompletedAt: result.ok ? new Date() : null, setupError: errorSummary },
  });

  return result;
}
