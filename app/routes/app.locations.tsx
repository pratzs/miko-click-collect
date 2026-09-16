import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Divider,
  Box,
  EmptyState,
  Banner,
} from "@shopify/polaris";
import { LocationIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlan, canAddLocation } from "../utils/plans";
import { listShopifyLocations, syncNativePickup } from "../utils/native-pickup.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [config, locations] = await Promise.all([
    db.shopConfig.findUnique({ where: { shop } }),
    db.pickupLocation.findMany({
      where: { shop },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const planName = config?.planName ?? "free";
  const plan = getPlan(planName);
  const activeCount = locations.filter((l) => l.isActive).length;
  const canAdd = canAddLocation(planName, activeCount);

  const checkoutMode = config?.checkoutMode ?? "native";

  // In native mode a pickup point that isn't linked to a Shopify location does
  // not exist as far as checkout is concerned. Count the store locations we
  // could still import so the page can offer it instead of making the merchant
  // retype addresses Shopify already has.
  let importableCount = 0;
  let addressless: string[] = [];
  if (checkoutMode === "native") {
    try {
      const shopifyLocations = await listShopifyLocations(shop, session.accessToken ?? "");
      const claimed = new Set(locations.map((l) => l.shopifyLocationId).filter(Boolean));
      importableCount = shopifyLocations.filter(
        (l) => l.fulfillsOnlineOrders && !claimed.has(l.id),
      ).length;
      // Switched on, in stock, and still never offered to a customer: Shopify
      // finds pickup locations by proximity, so one without a street address
      // matches nobody.
      addressless = locations
        .filter(
          (l) =>
            l.isActive &&
            l.shopifyLocationId &&
            shopifyLocations.some((s) => s.id === l.shopifyLocationId && !s.hasMappableAddress),
        )
        .map((l) => l.name);
    } catch (err) {
      console.error("[locations] could not count importable Shopify locations:", err);
    }
  }

  return json({
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      city: l.city,
      phone: l.phone,
      isActive: l.isActive,
      prepTimeMinutes: l.prepTimeMinutes,
      shopifyLocationId: l.shopifyLocationId,
      localPickupEnabled: l.localPickupEnabled,
    })),
    plan,
    planName,
    activeCount,
    canAdd,
    checkoutMode,
    importableCount,
    addressless,
  });
};

/**
 * Import the store's own Shopify locations as pickup points.
 *
 * Native mode needs every pickup point to BE a Shopify location, so asking the
 * merchant to retype addresses Shopify already holds and then link them back up
 * is pure friction — and the step people forget, leaving pickup points that
 * silently never appear at checkout.
 *
 * Only imports locations that fulfill online orders (Shopify will not offer the
 * others for pickup anyway), never touches an existing pickup point, and
 * respects the plan's location limit.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await db.shopConfig.findUnique({ where: { shop } });
  const planName = config?.planName ?? "free";

  let shopifyLocations;
  try {
    shopifyLocations = await listShopifyLocations(shop, session.accessToken ?? "");
  } catch (err) {
    return json(
      {
        ok: false,
        message: `We couldn't read your Shopify locations: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  const existing = await db.pickupLocation.findMany({ where: { shop } });
  const claimed = new Set(existing.map((l) => l.shopifyLocationId).filter(Boolean));
  const candidates = shopifyLocations.filter((l) => l.fulfillsOnlineOrders && !claimed.has(l.id));

  let activeCount = existing.filter((l) => l.isActive).length;
  let imported = 0;
  let skippedForPlan = 0;

  for (const loc of candidates) {
    if (!canAddLocation(planName, activeCount)) {
      skippedForPlan += 1;
      continue;
    }
    const [address, city, postcode] = loc.address.split(",").map((s) => s.trim());
    await db.pickupLocation.create({
      data: {
        shop,
        name: loc.name,
        address: address ?? "",
        city: city ?? "",
        postcode: postcode ?? "",
        shopifyLocationId: loc.id,
      },
    });
    activeCount += 1;
    imported += 1;
  }

  if (imported > 0) {
    try {
      await syncNativePickup(shop, session.accessToken ?? "");
    } catch (err) {
      console.error("[locations] native pickup sync after import failed:", err);
      return json({
        ok: false,
        message: `Imported ${imported} location${imported === 1 ? "" : "s"}, but couldn't switch pickup on at checkout. Open Settings and choose "Re-run setup".`,
      });
    }
  }

  const parts: string[] = [];
  if (imported > 0) {
    parts.push(
      `Imported ${imported} location${imported === 1 ? "" : "s"} and switched pickup on at checkout.`,
    );
  } else {
    parts.push("Nothing to import — every Shopify location that fulfills online orders is already set up.");
  }
  if (skippedForPlan > 0) {
    parts.push(
      `${skippedForPlan} more ${skippedForPlan === 1 ? "was" : "were"} left out because your plan allows ${getPlan(planName).locationLimit} location${getPlan(planName).locationLimit === 1 ? "" : "s"}.`,
    );
  }

  return json({ ok: imported > 0 || skippedForPlan === 0, message: parts.join(" ") });
};

export default function LocationsPage() {
  const { locations, plan, planName, activeCount, canAdd, checkoutMode, importableCount, addressless } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const importer = useFetcher<{ ok?: boolean; message?: string }>();

  const isNative = checkoutMode === "native";
  const unlinked = isNative
    ? locations.filter((l) => l.isActive && !l.shopifyLocationId)
    : [];

  return (
    <Page
      title="Pickup Locations"
      primaryAction={{
        content: "Add location",
        disabled: !canAdd,
        onAction: () => navigate("/app/locations/new"),
      }}
      secondaryActions={
        isNative && importableCount > 0
          ? [
              {
                content: `Import ${importableCount} from Shopify`,
                loading: importer.state !== "idle",
                onAction: () => importer.submit({}, { method: "POST" }),
              },
            ]
          : []
      }
    >
      <Layout>
        {importer.data?.message && (
          <Layout.Section>
            <Banner tone={importer.data.ok ? "success" : "warning"}>
              {importer.data.message}
            </Banner>
          </Layout.Section>
        )}

        {addressless.length > 0 && (
          <Layout.Section>
            <Banner
              tone="critical"
              title={`Shopify can't offer ${addressless.length === 1 ? "this location" : "these locations"} to customers`}
            >
              <p>
                Pickup is switched on for {addressless.join(", ")}, but the matching Shopify
                location has no street address. Shopify finds pickup locations by how close they
                are to the customer, so one without an address is never offered — customers see
                &quot;No locations with your item&quot; even though the item is in stock. Add the
                street address in Settings &rarr; Locations.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {unlinked.length > 0 && (
          <Layout.Section>
            <Banner
              tone="warning"
              title={`${unlinked.length} pickup location${unlinked.length === 1 ? " is" : "s are"} not showing at checkout`}
            >
              <p>
                {unlinked.map((l) => l.name).join(", ")}{" "}
                {unlinked.length === 1 ? "isn't" : "aren't"} linked to a Shopify location yet.
                Shopify switches pickup on per location, so customers can&apos;t choose{" "}
                {unlinked.length === 1 ? "it" : "them"} until you link{" "}
                {unlinked.length === 1 ? "it" : "them"}.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {!canAdd && (
          <Layout.Section>
            <Banner
              title={`You've reached the ${plan.name} plan limit of ${plan.locationLimit} location${plan.locationLimit !== 1 ? "s" : ""}`}
              tone="warning"
              action={{ content: "Upgrade plan", onAction: () => navigate("/app/pricing") }}
            >
              <p>Upgrade to add more pickup locations.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            {locations.length === 0 ? (
              <EmptyState
                heading="Add your first pickup location"
                action={
                  isNative && importableCount > 0
                    ? {
                        content: `Import ${importableCount} from Shopify`,
                        loading: importer.state !== "idle",
                        onAction: () => importer.submit({}, { method: "POST" }),
                      }
                    : { content: "Add location", onAction: () => navigate("/app/locations/new") }
                }
                secondaryAction={
                  isNative && importableCount > 0
                    ? { content: "Add manually", onAction: () => navigate("/app/locations/new") }
                    : undefined
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Locations are where customers collect their orders.
                  {isNative && importableCount > 0
                    ? ` You already have ${importableCount} Shopify location${importableCount === 1 ? "" : "s"} that can fulfill online orders — import ${importableCount === 1 ? "it" : "them"} and pickup is live at checkout straight away.`
                    : " Add your store addresses, warehouses, or distribution points."}
                </p>
              </EmptyState>
            ) : (
              <BlockStack gap="0">
                {locations.map((location, idx) => (
                  <Box key={location.id}>
                    {idx > 0 && <Divider />}
                    <Box padding="400">
                      <InlineStack align="space-between" wrap={false}>
                        <InlineStack gap="400" align="start">
                          <BlockStack gap="100">
                            <InlineStack gap="200">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">{location.name}</Text>
                              <Badge tone={location.isActive ? "success" : "attention"}>
                                {location.isActive ? "Active" : "Inactive"}
                              </Badge>
                              {/* "Active" is our own flag; this says whether
                                  Shopify is actually offering it at checkout. */}
                              {isNative && location.isActive && !location.localPickupEnabled && (
                                <Badge tone="warning">Not at checkout</Badge>
                              )}
                            </InlineStack>
                            {(location.address || location.city) && (
                              <Text variant="bodySm" tone="subdued" as="p">
                                {[location.address, location.city].filter(Boolean).join(", ")}
                              </Text>
                            )}
                            <Text variant="bodySm" tone="subdued" as="p">
                              Ready in {location.prepTimeMinutes < 60 ? `${location.prepTimeMinutes}min` : `${location.prepTimeMinutes / 60}hr`}
                              {location.phone ? ` · ${location.phone}` : ""}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        <Button variant="plain" size="slim" onClick={() => navigate(`/app/locations/${location.id}`)}>
                          Edit
                        </Button>
                      </InlineStack>
                    </Box>
                  </Box>
                ))}
              </BlockStack>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
