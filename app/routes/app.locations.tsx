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
  TextField,
  Icon,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { useMemo, useState } from "react";
import { pickupTimeLabel, prepTimeToPickupTime } from "../utils/pickup-time";
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

  // A pickup point that isn't linked to a Shopify location does not exist as
  // far as checkout is concerned. Count the store locations we could still
  // import so the page can offer it instead of making the merchant retype
  // addresses Shopify already has.
  let importableCount = 0;
  let addressless: string[] = [];
  {
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

/**
 * Name a few and count the rest.
 *
 * These banners used to join every affected location into one sentence. One
 * store reads fine. A chain with forty unlinked stores gets a paragraph of
 * comma-separated names that nobody reads and that pushes the rest of the page
 * off the screen.
 */
function nameList(names: string[], show = 4): string {
  if (names.length <= show) return names.join(", ");
  return `${names.slice(0, show).join(", ")} and ${names.length - show} more`;
}

export default function LocationsPage() {
  const { locations, plan, planName, activeCount, canAdd, importableCount, addressless } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const importer = useFetcher<{ ok?: boolean; message?: string }>();

  // Filtered in the browser: the loader already has every location, the plan
  // caps how many there can be, and a store manager looking for one shop in a
  // list of seventy should not wait for a round trip per keystroke.
  const [filter, setFilter] = useState("");
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((l) =>
      [l.name, l.address, l.city].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [filter, locations]);

  const unlinked = locations.filter((l) => l.isActive && !l.shopifyLocationId);

  return (
    <Page
      title="Pickup Locations"
      primaryAction={{
        content: "Add location",
        disabled: !canAdd,
        onAction: () => navigate("/app/locations/new"),
      }}
      secondaryActions={
        importableCount > 0
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
                Pickup is switched on for {nameList(addressless)}, but the matching Shopify
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
                {nameList(unlinked.map((l) => l.name))}{" "}
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
                  importableCount > 0
                    ? {
                        content: `Import ${importableCount} from Shopify`,
                        loading: importer.state !== "idle",
                        onAction: () => importer.submit({}, { method: "POST" }),
                      }
                    : { content: "Add location", onAction: () => navigate("/app/locations/new") }
                }
                secondaryAction={
                  importableCount > 0
                    ? { content: "Add manually", onAction: () => navigate("/app/locations/new") }
                    : undefined
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Locations are where customers collect their orders.
                  {importableCount > 0
                    ? ` You already have ${importableCount} Shopify location${importableCount === 1 ? "" : "s"} that can fulfill online orders — import ${importableCount === 1 ? "it" : "them"} and pickup is live at checkout straight away.`
                    : " Add your store addresses, warehouses, or distribution points."}
                </p>
              </EmptyState>
            ) : (
              <BlockStack gap="0">
                {locations.length > 8 && (
                  <>
                    <Box padding="300">
                      <TextField
                        label="Search locations"
                        labelHidden
                        value={filter}
                        onChange={setFilter}
                        placeholder="Search by store name, street or city"
                        prefix={<Icon source={SearchIcon} />}
                        clearButton
                        onClearButtonClick={() => setFilter("")}
                        autoComplete="off"
                      />
                    </Box>
                    <Divider />
                  </>
                )}

                {visible.length === 0 && (
                  <Box padding="600">
                    <BlockStack gap="200" inlineAlign="center">
                      <Text as="p" fontWeight="semibold">No locations match &quot;{filter}&quot;</Text>
                      <Button variant="plain" onClick={() => setFilter("")}>Clear search</Button>
                    </BlockStack>
                  </Box>
                )}

                {visible.map((location, idx) => (
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
                              {location.isActive && !location.localPickupEnabled && (
                                <Badge tone="warning">Not at checkout</Badge>
                              )}
                            </InlineStack>
                            {(location.address || location.city) && (
                              <Text variant="bodySm" tone="subdued" as="p">
                                {[location.address, location.city].filter(Boolean).join(", ")}
                              </Text>
                            )}
                            {/* The line the shopper is shown at checkout, word
                                for word. Dividing minutes by 60 turned the
                                "2-4 days" option into "Ready in 72hr", which is
                                not a sentence any customer sees. */}
                            <Text variant="bodySm" tone="subdued" as="p">
                              {pickupTimeLabel(prepTimeToPickupTime(location.prepTimeMinutes))}
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
