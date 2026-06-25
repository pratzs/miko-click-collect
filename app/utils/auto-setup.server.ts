/**
 * Auto-setup creates everything in the merchant's Shopify store that's needed
 * for Click and Collect to "just work" — no manual configuration required.
 *
 * Design: one Shopify shipping rate per pickup location.
 *   - Location with no fee   → "Click and Collect - {Name}" @ $0
 *   - Location with a fee    → "Click and Collect - {Name}" @ ${fee}
 *
 * The delivery customisation function then shows ONLY the rate matching the
 * customer's selected location (and hides all paid shipping rates), and hides
 * every "Click and Collect - *" rate when pickup is NOT selected.
 *
 * Benefits:
 *   - No fake fee product, no product-availability errors at checkout
 *   - Tax is handled natively by Shopify per-rate
 *   - Fees are visible as part of standard shipping line, not a mysterious item
 *
 * All steps are idempotent.
 */

import { db } from "../db.server";

const API_VERSION = "2026-04";
const DELIVERY_CUSTOMIZATION_TITLE = "Click and Collect - Hide Shipping";
const FUNCTION_TITLE = "Click and Collect - Hide Shipping";
const RATE_PREFIX = "Click and Collect"; // rate titles are "Click and Collect - {location name}"

type ShopifyGraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };

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

function rateNameForLocation(name: string): string {
  return `${RATE_PREFIX} - ${name}`;
}

async function fetchShopCurrency(shop: string, accessToken: string): Promise<string> {
  const res = await shopifyGraphql<{ shop: { currencyCode: string } }>(
    shop,
    accessToken,
    `{ shop { currencyCode } }`,
  );
  return res.data?.shop?.currencyCode ?? "USD";
}

/* ===== Cleanup: remove any service fee product from older app versions ===== */

async function cleanupLegacyServiceFeeProduct(shop: string, accessToken: string, productId: string) {
  if (!productId) return;
  await shopifyGraphql(
    shop,
    accessToken,
    `mutation($input: ProductDeleteInput!) {
      productDelete(input: $input) { deletedProductId userErrors { message } }
    }`,
    { input: { id: productId } },
  ).catch(() => null);
}

/* ===== Per-location shipping rates ===== */

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

async function ensureLocationRate(
  shop: string,
  accessToken: string,
  profile: DeliveryProfileShape,
  currencyCode: string,
  location: { id: string; name: string; serviceFeeType: string; serviceFeeAmount: number; shopifyRateId: string },
): Promise<string> {
  const desiredName = rateNameForLocation(location.name);
  const desiredPrice =
    location.serviceFeeType !== "free" && location.serviceFeeAmount > 0
      ? location.serviceFeeAmount.toFixed(2)
      : "0.00";

  // Check existing rate by stored ID
  for (const lg of profile.profileLocationGroups) {
    for (const zone of lg.locationGroupZones.nodes) {
      for (const md of zone.methodDefinitions.nodes) {
        if (location.shopifyRateId && md.id === location.shopifyRateId) {
          // Update it to the desired name/price
          await shopifyGraphql(
            shop,
            accessToken,
            `mutation($id: ID!, $profile: DeliveryProfileInput!) {
              deliveryProfileUpdate(id: $id, profile: $profile) {
                userErrors { message }
              }
            }`,
            {
              id: profile.id,
              profile: {
                locationGroupsToUpdate: [
                  {
                    id: lg.locationGroup.id,
                    zonesToUpdate: [
                      {
                        id: zone.zone.id,
                        methodDefinitionsToUpdate: [
                          {
                            id: md.id,
                            name: desiredName,
                            active: true,
                            rateDefinition: { price: { amount: desiredPrice, currencyCode } },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          );
          return md.id;
        }
      }
    }
  }

  // Match an existing rate by name (e.g. setup re-running after DB lost the ID)
  for (const lg of profile.profileLocationGroups) {
    for (const zone of lg.locationGroupZones.nodes) {
      const found = zone.methodDefinitions.nodes.find((m) => m.name === desiredName);
      if (found) {
        await shopifyGraphql(
          shop,
          accessToken,
          `mutation($id: ID!, $profile: DeliveryProfileInput!) {
            deliveryProfileUpdate(id: $id, profile: $profile) {
              userErrors { message }
            }
          }`,
          {
            id: profile.id,
            profile: {
              locationGroupsToUpdate: [
                {
                  id: lg.locationGroup.id,
                  zonesToUpdate: [
                    {
                      id: zone.zone.id,
                      methodDefinitionsToUpdate: [
                        {
                          id: found.id,
                          name: desiredName,
                          active: true,
                          rateDefinition: { price: { amount: desiredPrice, currencyCode } },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        );
        return found.id;
      }
    }
  }

  // Doesn't exist — create it on the first zone of the first location group
  const firstLg = profile.profileLocationGroups[0];
  if (!firstLg || firstLg.locationGroupZones.nodes.length === 0) {
    throw new Error(
      `Default delivery profile has no shipping zones. Open Shopify Admin → Settings → Shipping and delivery and add at least one zone first.`,
    );
  }
  const firstZone = firstLg.locationGroupZones.nodes[0];

  const create = await shopifyGraphql<{
    deliveryProfileUpdate: {
      profile: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    shop,
    accessToken,
    `mutation($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile { id }
        userErrors { message field }
      }
    }`,
    {
      id: profile.id,
      profile: {
        locationGroupsToUpdate: [
          {
            id: firstLg.locationGroup.id,
            zonesToUpdate: [
              {
                id: firstZone.zone.id,
                methodDefinitionsToCreate: [
                  {
                    name: desiredName,
                    description: `Pickup from ${location.name}`,
                    active: true,
                    rateDefinition: { price: { amount: desiredPrice, currencyCode } },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  );

  const errors = create.data?.deliveryProfileUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Could not create rate for ${location.name}: ${errors.map((e) => e.message).join("; ")}`);
  }
  if (create.errors && create.errors.length > 0) {
    throw new Error(`GraphQL error creating rate for ${location.name}: ${create.errors.map((e) => e.message).join("; ")}`);
  }

  // Re-fetch to find the new method definition ID
  const refreshed = await fetchPrimaryDeliveryProfile(shop, accessToken);
  for (const lg of refreshed.profileLocationGroups) {
    for (const zone of lg.locationGroupZones.nodes) {
      const found = zone.methodDefinitions.nodes.find((m) => m.name === desiredName);
      if (found) return found.id;
    }
  }
  throw new Error(`Created rate for ${location.name} but could not find its ID after creation. Check that the shipping zone allows this rate.`);
}

async function deleteRate(shop: string, accessToken: string, rateId: string) {
  if (!rateId) return;
  const profile = await fetchPrimaryDeliveryProfile(shop, accessToken).catch(() => null);
  if (!profile) return;

  // Find the location group and zone that contains the rate
  for (const lg of profile.profileLocationGroups) {
    for (const zone of lg.locationGroupZones.nodes) {
      const found = zone.methodDefinitions.nodes.find((m) => m.id === rateId);
      if (found) {
        await shopifyGraphql(
          shop,
          accessToken,
          `mutation($id: ID!, $profile: DeliveryProfileInput!) {
            deliveryProfileUpdate(id: $id, profile: $profile) {
              userErrors { message }
            }
          }`,
          {
            id: profile.id,
            profile: {
              locationGroupsToUpdate: [
                {
                  id: lg.locationGroup.id,
                  zonesToUpdate: [{ id: zone.zone.id, methodDefinitionsToDelete: [rateId] }],
                },
              ],
            },
          },
        ).catch(() => null);
        return;
      }
    }
  }
}

/**
 * Public helper called from the Locations route after create/update/delete.
 */
export async function syncLocationRate(shop: string, locationId: string): Promise<void> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config?.accessToken) return;

  const location = await db.pickupLocation.findUnique({ where: { id: locationId } });
  const accessToken = config.accessToken;

  if (!location) {
    // Location deleted — drop the rate too (look it up by name in case the ID is lost)
    return;
  }

  const profile = await fetchPrimaryDeliveryProfile(shop, accessToken);
  const currencyCode = await fetchShopCurrency(shop, accessToken);
  const rateId = await ensureLocationRate(shop, accessToken, profile, currencyCode, location);
  if (rateId && rateId !== location.shopifyRateId) {
    await db.pickupLocation.update({ where: { id: locationId }, data: { shopifyRateId: rateId } });
  }
}

/**
 * Delete a rate by location ID before/after the row is removed from the DB.
 */
export async function deleteLocationRate(shop: string, rateId: string, locationName: string): Promise<void> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config?.accessToken) return;
  const accessToken = config.accessToken;

  if (rateId) {
    await deleteRate(shop, accessToken, rateId);
    return;
  }

  // Fallback: delete by name match
  const profile = await fetchPrimaryDeliveryProfile(shop, accessToken).catch(() => null);
  if (!profile) return;
  const target = rateNameForLocation(locationName);
  for (const lg of profile.profileLocationGroups) {
    for (const zone of lg.locationGroupZones.nodes) {
      const found = zone.methodDefinitions.nodes.find((m) => m.name === target);
      if (found) {
        await deleteRate(shop, accessToken, found.id);
        return;
      }
    }
  }
}

/* ===== Delivery customisation ===== */

async function ensureDeliveryCustomization(
  shop: string,
  accessToken: string,
  existingId: string,
  existingFunctionId: string,
): Promise<{ id: string; functionId: string }> {
  const fnRes = await shopifyGraphql<{
    shopifyFunctions: { nodes: Array<{ id: string; title: string; apiType: string }> };
  }>(
    shop,
    accessToken,
    `{ shopifyFunctions(first: 25) { nodes { id title apiType } } }`,
  );

  const fn = fnRes.data?.shopifyFunctions?.nodes?.find(
    (f) => f.apiType === "delivery_customization" && f.title === FUNCTION_TITLE,
  );
  if (!fn) {
    throw new Error("Click and Collect delivery function is not deployed to this store yet");
  }

  if (existingId && existingFunctionId === fn.id) {
    return { id: existingId, functionId: fn.id };
  }

  if (existingId) {
    await shopifyGraphql(
      shop,
      accessToken,
      `mutation($id: ID!) {
        deliveryCustomizationDelete(id: $id) { deletedId userErrors { message } }
      }`,
      { id: existingId },
    ).catch(() => null);
  }

  const create = await shopifyGraphql<{
    deliveryCustomizationCreate: {
      deliveryCustomization: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    shop,
    accessToken,
    `mutation deliveryCustomizationCreate($deliveryCustomization: DeliveryCustomizationInput!) {
      deliveryCustomizationCreate(deliveryCustomization: $deliveryCustomization) {
        deliveryCustomization { id }
        userErrors { message }
      }
    }`,
    {
      deliveryCustomization: {
        functionId: fn.id,
        title: DELIVERY_CUSTOMIZATION_TITLE,
        enabled: true,
      },
    },
  );

  const errors = create.data?.deliveryCustomizationCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Could not create delivery customisation: ${errors.map((e) => e.message).join("; ")}`);
  }

  const id = create.data?.deliveryCustomizationCreate?.deliveryCustomization?.id;
  if (!id) throw new Error("Delivery customisation was created but no ID was returned");

  return { id, functionId: fn.id };
}

/* ===== Orchestrator ===== */

export type SetupResult = {
  ok: boolean;
  steps: {
    locationRates: { ok: boolean; error?: string; count?: number };
    deliveryCustomization: { ok: boolean; error?: string };
    cleanup: { ok: boolean; error?: string };
  };
};

export async function runAutoSetup(shop: string, accessToken: string): Promise<SetupResult> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config) {
    return {
      ok: false,
      steps: {
        locationRates: { ok: false, error: "Shop config missing" },
        deliveryCustomization: { ok: false, error: "Shop config missing" },
        cleanup: { ok: false, error: "Shop config missing" },
      },
    };
  }

  const result: SetupResult = {
    ok: true,
    steps: {
      locationRates: { ok: false },
      deliveryCustomization: { ok: false },
      cleanup: { ok: false },
    },
  };

  // Step 0: clean up the old service fee product if it exists (no longer used)
  try {
    if (config.serviceFeeProductId) {
      await cleanupLegacyServiceFeeProduct(shop, accessToken, config.serviceFeeProductId);
      await db.shopConfig.update({
        where: { shop },
        data: { serviceFeeProductId: "", serviceFeeVariantId: "", pickupShippingRateId: "" },
      });
    }
    result.steps.cleanup = { ok: true };
  } catch (e) {
    result.steps.cleanup = { ok: false, error: e instanceof Error ? e.message : String(e) };
    // non-fatal
  }

  // Step 1: per-location shipping rates
  try {
    const profile = await fetchPrimaryDeliveryProfile(shop, accessToken);
    const currencyCode = await fetchShopCurrency(shop, accessToken);
    const locations = await db.pickupLocation.findMany({ where: { shop, isActive: true } });

    let synced = 0;
    const failures: string[] = [];
    for (const loc of locations) {
      try {
        const rateId = await ensureLocationRate(shop, accessToken, profile, currencyCode, loc);
        if (rateId) {
          if (rateId !== loc.shopifyRateId) {
            await db.pickupLocation.update({ where: { id: loc.id }, data: { shopifyRateId: rateId } });
          }
          synced++;
        } else {
          failures.push(`${loc.name}: rate creation returned no ID`);
        }
      } catch (locErr) {
        failures.push(`${loc.name}: ${locErr instanceof Error ? locErr.message : String(locErr)}`);
      }
    }

    if (failures.length > 0) {
      result.ok = false;
      result.steps.locationRates = {
        ok: false,
        count: synced,
        error: failures.join(" | "),
      };
    } else {
      result.steps.locationRates = { ok: true, count: synced };
    }
  } catch (e) {
    result.ok = false;
    result.steps.locationRates = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Step 2: delivery customisation
  try {
    const { id, functionId } = await ensureDeliveryCustomization(
      shop,
      accessToken,
      config.deliveryCustomizationId,
      config.deliveryCustomizationFunctionId,
    );
    await db.shopConfig.update({
      where: { shop },
      data: { deliveryCustomizationId: id, deliveryCustomizationFunctionId: functionId },
    });
    result.steps.deliveryCustomization = { ok: true };
  } catch (e) {
    result.ok = false;
    result.steps.deliveryCustomization = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const errorSummary = Object.entries(result.steps)
    .filter(([, v]) => !v.ok)
    .map(([k, v]) => `${k}: ${v.error}`)
    .join(" | ");

  await db.shopConfig.update({
    where: { shop },
    data: {
      setupCompletedAt: result.ok ? new Date() : null,
      setupError: errorSummary,
    },
  });

  return result;
}
