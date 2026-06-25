/**
 * Auto-setup runs once per shop on first auth (or via the "Re-run setup" button).
 *
 * Creates everything the merchant needs to use Click and Collect without any manual work:
 *   1. Hidden "Click and Collect Service Fee" product (used as a line item for packing fees)
 *   2. Free "Click and Collect" shipping rate on the default delivery profile
 *   3. Delivery customisation linked to the latest Shopify Function version
 *
 * All steps are idempotent — safe to re-run.
 */

import { db } from "../db.server";

const API_VERSION = "2026-04";

const SERVICE_FEE_PRODUCT_TITLE = "Click and Collect Service Fee";
const SERVICE_FEE_PRODUCT_HANDLE = "miko-click-collect-service-fee";
const PICKUP_RATE_NAME = "Click and Collect - Free";
const DELIVERY_CUSTOMIZATION_TITLE = "Click and Collect - Hide Shipping";
const FUNCTION_TITLE = "Click and Collect - Hide Shipping";

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

/* ===== Step 1: Service fee product ===== */

async function ensureServiceFeeProduct(
  shop: string,
  accessToken: string,
  existingVariantId: string,
): Promise<{ productId: string; variantId: string }> {
  // If we already have an ID, verify it still exists and ensure it's published
  if (existingVariantId) {
    const verify = await shopifyGraphql<{ productVariant: { id: string; product: { id: string } } | null }>(
      shop,
      accessToken,
      `query($id: ID!) { productVariant(id: $id) { id product { id } } }`,
      { id: existingVariantId },
    );
    if (verify.data?.productVariant?.id) {
      const productId = verify.data.productVariant.product.id;
      // Re-publish on every setup run — fixes "Unavailable product" if publication was lost
      await publishProductEverywhere(shop, accessToken, productId);
      return { productId, variantId: verify.data.productVariant.id };
    }
  }

  // Look for an existing product by handle (in case the merchant or a previous install made one)
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

  // Create the product fresh
  const create = await shopifyGraphql<{
    productCreate: {
      product: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
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
        productType: "Service",
        vendor: "Click and Collect",
        status: "ACTIVE",
        tags: ["miko-click-collect", "hidden"],
        descriptionHtml:
          "<p>This is an internal product used by the Click and Collect app to add packing or service fees to orders. " +
          "Do not delete or modify. It is hidden from your storefront.</p>",
      },
    },
  );

  const errors = create.data?.productCreate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Could not create service fee product: ${errors.map((e) => e.message).join("; ")}`);
  }

  const productId = create.data?.productCreate?.product?.id ?? "";
  if (!productId) {
    throw new Error("Service fee product was created but no product ID was returned");
  }

  // Fetch the default variant ID separately (productCreate doesn't include variants in API 2026-04)
  const variantQuery = await shopifyGraphql<{
    product: { variants: { nodes: Array<{ id: string }> } } | null;
  }>(
    shop,
    accessToken,
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 1) { nodes { id } }
      }
    }`,
    { id: productId },
  );

  const variantId = variantQuery.data?.product?.variants.nodes[0]?.id ?? "";
  if (!variantId) {
    throw new Error("Service fee product was created but no variant was found");
  }

  // Configure the variant: $0 price, not taxable, no inventory tracking, no shipping
  await shopifyGraphql(
    shop,
    accessToken,
    `mutation variantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
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

  // Publish the product to ALL sales channels so it can be added to cart at checkout.
  // Without publishing, customers see an "Unavailable product" error at checkout.
  await publishProductEverywhere(shop, accessToken, productId);

  return { productId, variantId };
}

async function publishProductEverywhere(shop: string, accessToken: string, productId: string) {
  const pubRes = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(
    shop,
    accessToken,
    `{ publications(first: 25) { nodes { id name } } }`,
  );

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

/* ===== Step 2: Free pickup shipping rate ===== */

async function ensurePickupShippingRate(
  shop: string,
  accessToken: string,
  existingRateId: string,
): Promise<string> {
  // Verify existing rate still exists
  if (existingRateId) {
    const verify = await shopifyGraphql<{ node: { id: string } | null }>(
      shop,
      accessToken,
      `query($id: ID!) { node(id: $id) { ... on DeliveryRateDefinition { id } } }`,
      { id: existingRateId },
    );
    if (verify.data?.node?.id) return verify.data.node.id;
  }

  // Find the default delivery profile and check whether a pickup rate already exists
  const profilesRes = await shopifyGraphql<{
    deliveryProfiles: {
      nodes: Array<{
        id: string;
        default: boolean;
        profileLocationGroups: Array<{
          locationGroup: { id: string };
          locationGroupZones: {
            nodes: Array<{
              zone: { id: string; name: string };
              methodDefinitions: {
                nodes: Array<{ id: string; name: string; rateProvider: { __typename: string } }>;
              };
            }>;
          };
        }>;
      }>;
    };
  }>(
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
                methodDefinitions(first: 50) {
                  nodes { id name rateProvider { __typename } }
                }
              }
            }
          }
        }
      }
    }`,
  );

  const profiles = profilesRes.data?.deliveryProfiles?.nodes ?? [];
  // Prefer the default profile, fall back to the first profile that has zones
  const defaultProfile =
    profiles.find((p) => p.default && p.profileLocationGroups?.length > 0) ??
    profiles.find((p) => p.profileLocationGroups?.length > 0);

  if (!defaultProfile) {
    if (profiles.length === 0) {
      throw new Error("This store has no delivery profiles. Add at least one shipping zone in Shopify Admin → Settings → Shipping and delivery.");
    }
    throw new Error("This store's delivery profile has no shipping zones. Add at least one shipping zone in Shopify Admin → Settings → Shipping and delivery.");
  }

  // Already has a rate matching our name? Reuse it.
  for (const lg of defaultProfile.profileLocationGroups) {
    for (const zone of lg.locationGroupZones.nodes) {
      const existing = zone.methodDefinitions.nodes.find(
        (m) => m.name.toLowerCase() === PICKUP_RATE_NAME.toLowerCase(),
      );
      if (existing) return existing.id;
    }
  }

  // Add a $0 method definition to the first zone of the first location group
  const firstLg = defaultProfile.profileLocationGroups[0];
  if (!firstLg || firstLg.locationGroupZones.nodes.length === 0) {
    throw new Error("Default delivery profile has no shipping zones — add at least one zone in Shopify Admin first");
  }
  const firstZone = firstLg.locationGroupZones.nodes[0];

  const update = await shopifyGraphql<{
    deliveryProfileUpdate: {
      profile: { id: string } | null;
      userErrors: Array<{ message: string }>;
    };
  }>(
    shop,
    accessToken,
    `mutation deliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
      deliveryProfileUpdate(id: $id, profile: $profile) {
        profile { id }
        userErrors { message field }
      }
    }`,
    {
      id: defaultProfile.id,
      profile: {
        locationGroupsToUpdate: [
          {
            id: firstLg.locationGroup.id,
            zonesToUpdate: [
              {
                id: firstZone.zone.id,
                methodDefinitionsToCreate: [
                  {
                    name: PICKUP_RATE_NAME,
                    description: "Collect from one of our pickup locations.",
                    active: true,
                    rateDefinition: {
                      price: { amount: "0.00", currencyCode: "USD" },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  );

  const errors = update.data?.deliveryProfileUpdate?.userErrors ?? [];
  if (errors.length > 0) {
    throw new Error(`Could not create pickup shipping rate: ${errors.map((e) => e.message).join("; ")}`);
  }

  // Re-fetch to get the new method definition ID
  const refetch = await shopifyGraphql<{
    deliveryProfile: {
      profileLocationGroups: Array<{
        locationGroupZones: {
          nodes: Array<{
            methodDefinitions: { nodes: Array<{ id: string; name: string }> };
          }>;
        };
      }>;
    };
  }>(
    shop,
    accessToken,
    `query($id: ID!) {
      deliveryProfile(id: $id) {
        profileLocationGroups {
          locationGroupZones(first: 25) {
            nodes {
              methodDefinitions(first: 50) { nodes { id name } }
            }
          }
        }
      }
    }`,
    { id: defaultProfile.id },
  );

  for (const lg of refetch.data?.deliveryProfile?.profileLocationGroups ?? []) {
    for (const zone of lg.locationGroupZones.nodes) {
      const found = zone.methodDefinitions.nodes.find(
        (m) => m.name.toLowerCase() === PICKUP_RATE_NAME.toLowerCase(),
      );
      if (found) return found.id;
    }
  }

  return ""; // rate exists but we couldn't find the ID — non-fatal
}

/* ===== Step 3: Delivery customisation ===== */

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

  // Current customisation already points to the latest function — nothing to do
  if (existingId && existingFunctionId === fn.id) {
    return { id: existingId, functionId: fn.id };
  }

  // Delete old (best-effort) and create fresh
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
    pickupShippingRate: { ok: boolean; error?: string };
    deliveryCustomization: { ok: boolean; error?: string };
  };
};

export async function runAutoSetup(shop: string, accessToken: string): Promise<SetupResult> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config) {
    return {
      ok: false,
      steps: {
        serviceFeeProduct: { ok: false, error: "Shop config missing" },
        pickupShippingRate: { ok: false, error: "Shop config missing" },
        deliveryCustomization: { ok: false, error: "Shop config missing" },
      },
    };
  }

  const result: SetupResult = {
    ok: true,
    steps: {
      serviceFeeProduct: { ok: false },
      pickupShippingRate: { ok: false },
      deliveryCustomization: { ok: false },
    },
  };

  // Step 1: service fee product
  try {
    const { productId, variantId } = await ensureServiceFeeProduct(
      shop,
      accessToken,
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

  // Step 2: pickup shipping rate
  try {
    const rateId = await ensurePickupShippingRate(shop, accessToken, config.pickupShippingRateId);
    await db.shopConfig.update({ where: { shop }, data: { pickupShippingRateId: rateId } });
    result.steps.pickupShippingRate = { ok: true };
  } catch (e) {
    result.ok = false;
    result.steps.pickupShippingRate = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Step 3: delivery customisation
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
