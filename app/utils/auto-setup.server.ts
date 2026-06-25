/**
 * Auto-setup creates everything in the merchant's Shopify store that's needed
 * for Click and Collect to "just work" — no manual configuration required.
 *
 * Design (hybrid):
 *   1. Per-location shipping rates, always priced $0 — gives Shopify a valid
 *      delivery option whose name identifies the pickup location.
 *   2. A hidden "Click and Collect Service Fee" product — added as a separate
 *      cart line item when the customer picks a paid location. Customer sees
 *      "Click and Collect Service Fee · $6.00" in the order summary instead
 *      of a vague "Shipping $6.00" line.
 *   3. Cart transform function that sets the fee line's price dynamically
 *      based on the cart's miko_fee_amount attribute, respecting "free above
 *      $X" thresholds.
 *
 * The delivery customisation function shows ONLY the rate matching the
 * customer's selected location (and hides all paid shipping rates), and hides
 * every "Click and Collect - *" rate when pickup is NOT selected.
 *
 * All steps are idempotent.
 */

import { db } from "../db.server";

const API_VERSION = "2026-04";
const DELIVERY_CUSTOMIZATION_TITLE = "Click and Collect - Hide Shipping";
const FUNCTION_TITLE = "Click and Collect - Hide Shipping";
const CART_TRANSFORM_FUNCTION_TITLE = "Click and Collect - Service Fee";
const RATE_PREFIX = "Click and Collect"; // rate titles are "Click and Collect - {location name}"
const SERVICE_FEE_PRODUCT_TITLE = "Click and Collect Service Fee";
const SERVICE_FEE_PRODUCT_HANDLE = "miko-click-collect-service-fee";

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

/* ===== Service fee product (used as a cart line item for paid pickups) ===== */

async function publishProductEverywhere(shop: string, accessToken: string, productId: string) {
  const pubRes = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(shop, accessToken, `{ publications(first: 25) { nodes { id name } } }`);

  const publications = pubRes.data?.publications?.nodes ?? [];
  if (publications.length === 0) return;

  await shopifyGraphql(
    shop,
    accessToken,
    `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { message }
      }
    }`,
    {
      id: productId,
      input: publications.map((p) => ({ publicationId: p.id })),
    },
  );
}

async function ensureServiceFeeProduct(
  shop: string,
  accessToken: string,
  existingProductId: string,
  existingVariantId: string,
): Promise<{ productId: string; variantId: string }> {
  // Verify existing variant is still alive
  if (existingVariantId) {
    const verify = await shopifyGraphql<{
      productVariant: { id: string; product: { id: string } } | null;
    }>(
      shop,
      accessToken,
      `query($id: ID!) { productVariant(id: $id) { id product { id } } }`,
      { id: existingVariantId },
    );
    if (verify.data?.productVariant?.id) {
      const productId = verify.data.productVariant.product.id;
      await publishProductEverywhere(shop, accessToken, productId);
      return { productId, variantId: verify.data.productVariant.id };
    }
  }

  // Look up by handle (existing product from a prior install)
  const lookup = await shopifyGraphql<{
    productByHandle: { id: string; variants: { nodes: Array<{ id: string }> } } | null;
  }>(
    shop,
    accessToken,
    `query { productByHandle(handle: "${SERVICE_FEE_PRODUCT_HANDLE}") { id variants(first: 1) { nodes { id } } } }`,
  );
  if (lookup.data?.productByHandle?.id) {
    const productId = lookup.data.productByHandle.id;
    const variantId = lookup.data.productByHandle.variants.nodes[0]?.id ?? "";
    if (variantId) {
      await publishProductEverywhere(shop, accessToken, productId);
      return { productId, variantId };
    }
  }

  // Create fresh
  const create = await shopifyGraphql<{
    productCreate: { product: { id: string } | null; userErrors: Array<{ message: string }> };
  }>(
    shop,
    accessToken,
    `mutation productCreate($input: ProductInput!) {
      productCreate(input: $input) {
        product { id }
        userErrors { message }
      }
    }`,
    {
      input: {
        title: SERVICE_FEE_PRODUCT_TITLE,
        handle: SERVICE_FEE_PRODUCT_HANDLE,
        // Unique product type and vendor so other apps (discounts, wholesale,
        // automatic promotions) can identify and skip this product
        productType: "__miko_internal_fee__",
        vendor: "Miko Click and Collect (internal)",
        status: "ACTIVE",
        // Tags signal "do not modify". Includes common no-discount conventions
        // used by Shopify discount apps in the wild
        tags: [
          "__miko_internal__",
          "miko-click-collect-fee",
          "no-discount",
          "no-automatic-discount",
          "hidden-product",
        ],
        seo: { title: "", description: "" },
        descriptionHtml: "",
      },
    },
  );

  const errors = create.data?.productCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Could not create service fee product: ${errors.map((e) => e.message).join("; ")}`);
  }
  const productId = create.data?.productCreate?.product?.id ?? "";
  if (!productId) throw new Error("Service fee product create returned no ID");

  const variantQuery = await shopifyGraphql<{
    product: { variants: { nodes: Array<{ id: string }> } } | null;
  }>(
    shop,
    accessToken,
    `query($id: ID!) { product(id: $id) { variants(first: 1) { nodes { id } } } }`,
    { id: productId },
  );
  const variantId = variantQuery.data?.product?.variants.nodes[0]?.id ?? "";
  if (!variantId) throw new Error("Service fee product was created but has no variant");

  // Configure variant: $0, not taxable, no inventory tracking, no shipping required
  await shopifyGraphql(
    shop,
    accessToken,
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { message }
      }
    }`,
    {
      productId,
      variants: [
        {
          id: variantId,
          price: "0.00",
          taxable: false,
          inventoryItem: { tracked: false, requiresShipping: false },
        },
      ],
    },
  );

  // Set metafields that signal "internal app product — do not touch":
  //   - seo.hidden:    themes exclude from search/sitemap/feeds
  //   - miko.internal: any Miko-family app (Wholesale Hub, Rentals, etc.)
  //                    should check this and skip the product entirely
  //   - miko.do_not_discount: explicit no-discount marker any 3rd-party
  //                    discount app can be configured to respect
  await shopifyGraphql(
    shop,
    accessToken,
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: "seo",
          key: "hidden",
          type: "single_line_text_field",
          value: "1",
        },
        {
          ownerId: productId,
          namespace: "miko",
          key: "internal",
          type: "boolean",
          value: "true",
        },
        {
          ownerId: productId,
          namespace: "miko",
          key: "owner_app",
          type: "single_line_text_field",
          value: "miko-click-collect",
        },
        {
          ownerId: productId,
          namespace: "miko",
          key: "do_not_discount",
          type: "boolean",
          value: "true",
        },
        {
          ownerId: productId,
          namespace: "miko",
          key: "do_not_modify",
          type: "boolean",
          value: "true",
        },
      ],
    },
  ).catch(() => null);

  await publishProductEverywhere(shop, accessToken, productId);

  return { productId, variantId };
}

/* ===== Per-location fee variant on the service fee product =====
 *
 * Why this exists: Shopify only allows ONE cart_transform function per shop,
 * and many merchants already have one installed (e.g. Discount Ninja). So we
 * can't rely on a cart_transform to set our line item's price.
 *
 * Instead, we create a dedicated variant on the service fee product for each
 * location that charges a fee. The variant's price IS the fee amount. When
 * the merchant changes a fee, we update the variant's price.
 *
 * The checkout extension adds the location-specific variant ID, so the price
 * is correct natively — no cart_transform conflict possible.
 */

async function syncLocationFeeVariant(
  shop: string,
  accessToken: string,
  productId: string,
  baseVariantId: string,
  location: {
    id: string;
    name: string;
    serviceFeeType: string;
    serviceFeeAmount: number;
    shopifyFeeVariantId: string;
    shopifyFeeVariantPrice: string;
  },
): Promise<{ variantId: string; price: string }> {
  // Free or zero-fee location → use the base $0 variant; no per-location variant needed
  const isFreeLocation =
    location.serviceFeeType === "free" || location.serviceFeeAmount <= 0;

  if (isFreeLocation) {
    // Optional cleanup: if a stale per-location variant exists, leave it (other locations may still use it)
    return { variantId: baseVariantId, price: "0.00" };
  }

  const desiredPrice = location.serviceFeeAmount.toFixed(2);
  const variantTitle = `${location.name} — Fee`;

  // If we already have a variant ID, check whether price still matches
  if (location.shopifyFeeVariantId && location.shopifyFeeVariantPrice === desiredPrice) {
    return { variantId: location.shopifyFeeVariantId, price: desiredPrice };
  }

  if (location.shopifyFeeVariantId) {
    // Update existing variant price
    const update = await shopifyGraphql<{
      productVariantsBulkUpdate: { userErrors: Array<{ message: string }> };
    }>(
      shop,
      accessToken,
      `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { message }
        }
      }`,
      {
        productId,
        variants: [{ id: location.shopifyFeeVariantId, price: desiredPrice }],
      },
    );
    const errs = update.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (errs.length > 0) {
      throw new Error(`Could not update fee variant for ${location.name}: ${errs.map((e) => e.message).join("; ")}`);
    }
    return { variantId: location.shopifyFeeVariantId, price: desiredPrice };
  }

  // Create a new variant for this location
  const create = await shopifyGraphql<{
    productVariantsBulkCreate: {
      productVariants: Array<{ id: string }> | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    shop,
    accessToken,
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkCreate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { message }
      }
    }`,
    {
      productId,
      variants: [
        {
          price: desiredPrice,
          optionValues: [{ optionName: "Title", name: variantTitle }],
          taxable: false,
          inventoryItem: { tracked: false, requiresShipping: false },
        },
      ],
    },
  );

  const errs = create.data?.productVariantsBulkCreate?.userErrors ?? [];
  if (errs.length > 0) {
    throw new Error(`Could not create fee variant for ${location.name}: ${errs.map((e) => e.message).join("; ")}`);
  }
  const newVariantId = create.data?.productVariantsBulkCreate?.productVariants?.[0]?.id ?? "";
  if (!newVariantId) {
    throw new Error(`Fee variant create for ${location.name} returned no ID`);
  }
  return { variantId: newVariantId, price: desiredPrice };
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
  // Rate is always $0 — the fee is added as a separate "Click and Collect Service Fee"
  // line item in the cart, so the customer sees it labelled correctly instead of as
  // generic Shopify "Shipping".
  const desiredPrice = "0.00";

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
    return;
  }

  const profile = await fetchPrimaryDeliveryProfile(shop, accessToken);
  const currencyCode = await fetchShopCurrency(shop, accessToken);

  // Sync the shipping rate (always $0; just the name matters)
  const rateId = await ensureLocationRate(shop, accessToken, profile, currencyCode, location);
  if (rateId && rateId !== location.shopifyRateId) {
    await db.pickupLocation.update({ where: { id: locationId }, data: { shopifyRateId: rateId } });
  }

  // Sync the per-location fee variant on the service fee product
  if (config.serviceFeeProductId && config.serviceFeeVariantId) {
    try {
      const { variantId, price } = await syncLocationFeeVariant(
        shop,
        accessToken,
        config.serviceFeeProductId,
        config.serviceFeeVariantId,
        location,
      );
      if (
        variantId !== location.shopifyFeeVariantId ||
        price !== location.shopifyFeeVariantPrice
      ) {
        await db.pickupLocation.update({
          where: { id: locationId },
          data: { shopifyFeeVariantId: variantId, shopifyFeeVariantPrice: price },
        });
      }
    } catch (err) {
      console.error("[syncLocationFeeVariant]", err);
    }
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
    serviceFeeProduct: { ok: boolean; error?: string };
    locationRates: { ok: boolean; error?: string; count?: number };
    deliveryCustomization: { ok: boolean; error?: string };
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
      serviceFeeProduct: { ok: false },
      locationRates: { ok: false },
      deliveryCustomization: { ok: false },
    },
  };

  // Step 0: service fee product
  try {
    const { productId, variantId } = await ensureServiceFeeProduct(
      shop,
      accessToken,
      config.serviceFeeProductId,
      config.serviceFeeVariantId,
    );
    await db.shopConfig.update({
      where: { shop },
      data: { serviceFeeProductId: productId, serviceFeeVariantId: variantId },
    });
    result.steps.serviceFeeProduct = { ok: true };
  } catch (e) {
    result.ok = false;
    result.steps.serviceFeeProduct = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Step 1: per-location shipping rates + fee variants
  try {
    const profile = await fetchPrimaryDeliveryProfile(shop, accessToken);
    const currencyCode = await fetchShopCurrency(shop, accessToken);
    const refreshedConfig = await db.shopConfig.findUnique({ where: { shop } });
    const locations = await db.pickupLocation.findMany({ where: { shop, isActive: true } });

    let synced = 0;
    const failures: string[] = [];
    for (const loc of locations) {
      try {
        const rateId = await ensureLocationRate(shop, accessToken, profile, currencyCode, loc);
        const updateData: {
          shopifyRateId?: string;
          shopifyFeeVariantId?: string;
          shopifyFeeVariantPrice?: string;
        } = {};

        if (rateId && rateId !== loc.shopifyRateId) {
          updateData.shopifyRateId = rateId;
        }

        // Sync the per-location fee variant if we have a service fee product
        if (refreshedConfig?.serviceFeeProductId && refreshedConfig?.serviceFeeVariantId) {
          const { variantId, price } = await syncLocationFeeVariant(
            shop,
            accessToken,
            refreshedConfig.serviceFeeProductId,
            refreshedConfig.serviceFeeVariantId,
            loc,
          );
          if (variantId !== loc.shopifyFeeVariantId) updateData.shopifyFeeVariantId = variantId;
          if (price !== loc.shopifyFeeVariantPrice) updateData.shopifyFeeVariantPrice = price;
        }

        if (Object.keys(updateData).length > 0) {
          await db.pickupLocation.update({ where: { id: loc.id }, data: updateData });
        }

        if (rateId) {
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
