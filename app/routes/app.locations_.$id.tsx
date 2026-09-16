import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigate, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  Select,
  Checkbox,
  Banner,
  Divider,
  Box,
  InlineGrid,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { syncLocationRate, deleteLocationRate } from "../utils/auto-setup.server";
import {
  listShopifyLocations,
  syncNativePickup,
  disableLocalPickup,
  type ShopifyLocation,
} from "../utils/native-pickup.server";
import { prepTimeToPickupTime, pickupTimeLabel } from "../utils/pickup-time";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABELS: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

type Hours = Record<string, { open: string; close: string; closed: boolean }>;

function defaultHours(): Hours {
  return Object.fromEntries(
    DAYS.map((d) => [d, { open: "09:00", close: "17:00", closed: d === "sat" || d === "sun" }])
  );
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const config = await db.shopConfig.findUnique({ where: { shop } });
  const checkoutMode = config?.checkoutMode ?? "native";

  // In native mode the pickup point has to BE a real Shopify location, because
  // that is what Shopify switches local pickup on for. Offer the store's
  // locations rather than asking the merchant to paste a GID.
  let shopifyLocations: ShopifyLocation[] = [];
  let shopifyLocationsError: string | null = null;
  if (checkoutMode === "native") {
    try {
      shopifyLocations = await listShopifyLocations(shop, session.accessToken ?? "");
    } catch (err) {
      shopifyLocationsError = err instanceof Error ? err.message : String(err);
      console.error("[locations] could not list Shopify locations:", err);
    }
  }

  // Locations already claimed by a DIFFERENT pickup point. Two pickup points on
  // one Shopify location cannot work: the order comes back naming the location,
  // and we would have no way to tell which of them the customer chose.
  const taken = await db.pickupLocation.findMany({
    where: { shop, shopifyLocationId: { not: "" }, ...(id !== "new" ? { NOT: { id } } : {}) },
    select: { shopifyLocationId: true, name: true },
  });

  if (id === "new") {
    return json({
      location: null,
      checkoutMode,
      shopifyLocations,
      shopifyLocationsError,
      taken,
    });
  }

  const location = await db.pickupLocation.findFirst({ where: { id, shop } });
  if (!location) throw new Response("Not found", { status: 404 });

  return json({
    checkoutMode,
    shopifyLocations,
    shopifyLocationsError,
    taken,
    location: {
      id: location.id,
      shopifyLocationId: location.shopifyLocationId,
      localPickupEnabled: location.localPickupEnabled,
      name: location.name,
      address: location.address,
      city: location.city,
      postcode: location.postcode,
      phone: location.phone,
      email: location.email,
      hours: location.hours as Hours,
      prepTimeMinutes: location.prepTimeMinutes,
      collectionInstructions: location.collectionInstructions,
      isActive: location.isActive,
      serviceFeeType: location.serviceFeeType,
      serviceFeeAmount: location.serviceFeeAmount,
      serviceFeeFreeAbove: location.serviceFeeFreeAbove,
      serviceFeeLabel: location.serviceFeeLabel,
    },
  });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "delete") {
    const loc = await db.pickupLocation.findUnique({ where: { id: id! } });
    await db.pickupLocation.deleteMany({ where: { id: id!, shop } });
    if (loc) {
      await deleteLocationRate(shop, loc.shopifyRateId, loc.name).catch((err) => {
        console.error("[location-rate-delete]", err);
      });
      // Only turn local pickup off if WE turned it on. A merchant may have had
      // pickup configured on that Shopify location long before installing this
      // app, and deleting a pickup point here must not stop their store taking
      // pickup orders.
      if (loc.localPickupEnabled && loc.shopifyLocationId) {
        await disableLocalPickup(shop, session.accessToken ?? "", loc.shopifyLocationId).catch(
          (err) => console.error("[local-pickup-disable]", err),
        );
      }
    }
    return redirect("/app/locations");
  }

  const name = ((form.get("name") as string) ?? "").trim();
  if (!name) return json({ error: "Location name is required." }, { status: 400 });
  if (name.length > 100) {
    return json({ error: "Location name must be 100 characters or less." }, { status: 400 });
  }

  // Reject obviously bogus fee amounts so they don't sneak into Shopify variant prices
  const feeAmount = parseFloat((form.get("serviceFeeAmount") as string) ?? "0");
  if (Number.isNaN(feeAmount) || feeAmount < 0 || feeAmount > 10000) {
    return json({ error: "Service fee must be between $0 and $10,000." }, { status: 400 });
  }
  const freeAbove = parseFloat((form.get("serviceFeeFreeAbove") as string) ?? "0");
  if (Number.isNaN(freeAbove) || freeAbove < 0) {
    return json({ error: "'Free above' threshold must be zero or positive." }, { status: 400 });
  }
  const prepTime = parseInt((form.get("prepTimeMinutes") as string) ?? "60");
  if (Number.isNaN(prepTime) || prepTime < 0 || prepTime > 10080) {
    return json({ error: "Prep time must be between 0 and 10080 minutes (one week)." }, { status: 400 });
  }

  const hoursRaw = form.get("hours") as string;
  let hours: Hours;
  try {
    hours = JSON.parse(hoursRaw);
  } catch {
    hours = defaultHours();
  }

  const data = {
    shop,
    name,
    address: (form.get("address") as string) || "",
    city: (form.get("city") as string) || "",
    postcode: (form.get("postcode") as string) || "",
    phone: (form.get("phone") as string) || "",
    email: (form.get("email") as string) || "",
    hours,
    prepTimeMinutes: prepTime,
    collectionInstructions: (form.get("collectionInstructions") as string) || "",
    isActive: form.get("isActive") === "true",
    serviceFeeType: (form.get("serviceFeeType") as string) || "free",
    serviceFeeAmount: feeAmount,
    serviceFeeFreeAbove: freeAbove,
    serviceFeeLabel: (form.get("serviceFeeLabel") as string) || "",
    shopifyLocationId: (form.get("shopifyLocationId") as string) || "",
  };

  // Guard the one mapping that cannot work. Two pickup points sharing a Shopify
  // location would both match every order collected there, and we would pick
  // one arbitrarily.
  if (data.shopifyLocationId) {
    const clash = await db.pickupLocation.findFirst({
      where: {
        shop,
        shopifyLocationId: data.shopifyLocationId,
        ...(id !== "new" ? { NOT: { id } } : {}),
      },
    });
    if (clash) {
      return json(
        {
          error: `"${clash.name}" already uses that Shopify location. Each pickup point needs its own, otherwise we can't tell which one a customer chose.`,
        },
        { status: 400 },
      );
    }
  }

  let savedId: string;
  if (id === "new") {
    const created = await db.pickupLocation.create({ data });
    savedId = created.id;
  } else {
    await db.pickupLocation.updateMany({ where: { id, shop }, data });
    savedId = id!;
  }

  const config = await db.shopConfig.findUnique({ where: { shop } });
  if ((config?.checkoutMode ?? "native") === "native") {
    // Push the change to Shopify's own local pickup settings. Awaited, not
    // fire-and-forget: this IS the feature in native mode, and the merchant is
    // about to look at a screen that claims it is on.
    try {
      await syncNativePickup(shop, session.accessToken ?? "");
    } catch (err) {
      console.error("[native-pickup-sync]", err);
    }
  } else {
    // Sync the Shopify shipping rate for this location (idempotent, background)
    syncLocationRate(shop, savedId).catch((err) => {
      console.error("[location-rate-sync]", err);
    });
  }

  return redirect("/app/locations");
};

export default function LocationFormPage() {
  const { location, checkoutMode, shopifyLocations, shopifyLocationsError, taken } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher<{ error?: string }>();

  const isNew = !location;
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [postcode, setPostcode] = useState(location?.postcode ?? "");
  const [phone, setPhone] = useState(location?.phone ?? "");
  const [email, setEmail] = useState(location?.email ?? "");
  const [prepTime, setPrepTime] = useState(String(location?.prepTimeMinutes ?? 60));
  const [instructions, setInstructions] = useState(location?.collectionInstructions ?? "");
  const [isActive, setIsActive] = useState(location?.isActive ?? true);
  const [hours, setHours] = useState<Hours>(
    (location?.hours as Hours) ?? defaultHours()
  );
  const [shopifyLocationId, setShopifyLocationId] = useState(location?.shopifyLocationId ?? "");
  const [serviceFeeType, setServiceFeeType] = useState(location?.serviceFeeType ?? "free");
  const [serviceFeeAmount, setServiceFeeAmount] = useState(String(location?.serviceFeeAmount ?? "0"));
  const [serviceFeeFreeAbove, setServiceFeeFreeAbove] = useState(String(location?.serviceFeeFreeAbove ?? "0"));
  const [serviceFeeLabel, setServiceFeeLabel] = useState(location?.serviceFeeLabel ?? "");

  const isSubmitting = fetcher.state !== "idle";

  function setDayHours(day: string, field: "open" | "close" | "closed", value: string | boolean) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  function submit(extra?: Record<string, string>) {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("address", address);
    fd.set("city", city);
    fd.set("postcode", postcode);
    fd.set("phone", phone);
    fd.set("email", email);
    fd.set("prepTimeMinutes", prepTime);
    fd.set("collectionInstructions", instructions);
    fd.set("isActive", String(isActive));
    fd.set("hours", JSON.stringify(hours));
    fd.set("serviceFeeType", serviceFeeType);
    fd.set("serviceFeeAmount", serviceFeeAmount);
    fd.set("serviceFeeFreeAbove", serviceFeeFreeAbove);
    fd.set("serviceFeeLabel", serviceFeeLabel);
    fd.set("shopifyLocationId", shopifyLocationId);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    fetcher.submit(fd, { method: "POST" });
  }

  const prepTimeOptions = [
    { label: "30 minutes", value: "30" },
    { label: "1 hour", value: "60" },
    { label: "2 hours", value: "120" },
    { label: "4 hours", value: "240" },
    { label: "Same day (end of day)", value: "480" },
    { label: "Next day", value: "1440" },
  ];

  return (
    <Page
      title={isNew ? "Add Pickup Location" : `Edit: ${location.name}`}
      backAction={{ content: "Locations", onAction: () => navigate("/app/locations") }}
      primaryAction={{
        content: isNew ? "Add location" : "Save changes",
        loading: isSubmitting,
        onAction: () => submit(),
      }}
      secondaryActions={
        !isNew
          ? [
              {
                content: "Delete location",
                destructive: true,
                onAction: () => {
                  if (confirm("Delete this location? This cannot be undone.")) submit({ intent: "delete" });
                },
              },
            ]
          : []
      }
    >
      {fetcher.data?.error && (
        <Box paddingBlockEnd="400">
          <Banner tone="critical">{fetcher.data.error}</Banner>
        </Box>
      )}

      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Location details</Text>
              <TextField label="Location name *" value={name} onChange={setName} autoComplete="off" placeholder="e.g. Auckland CBD Store" />
              <TextField label="Street address" value={address} onChange={setAddress} autoComplete="off" placeholder="123 Queen Street" />
              <InlineGrid columns={2} gap="400">
                <TextField label="City" value={city} onChange={setCity} autoComplete="off" placeholder="Auckland" />
                <TextField label="Postcode" value={postcode} onChange={setPostcode} autoComplete="off" placeholder="1010" />
              </InlineGrid>
              <InlineGrid columns={2} gap="400">
                <TextField label="Phone" value={phone} onChange={setPhone} autoComplete="off" type="tel" placeholder="+64 9 123 4567" />
                <TextField label="Email" value={email} onChange={setEmail} autoComplete="off" type="email" placeholder="store@example.co.nz" />
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {checkoutMode === "native" && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Shopify location</Text>
                {shopifyLocationsError ? (
                  <Banner tone="warning" title="We couldn't load your Shopify locations">
                    <Text as="p">
                      Shopify returned: {shopifyLocationsError}. Refresh the page to try again.
                      Until this is linked, the pickup point won't appear at checkout.
                    </Text>
                  </Banner>
                ) : (
                  <>
                    <Select
                      label="Which Shopify location is this?"
                      options={[
                        { label: "Not linked yet", value: "" },
                        ...shopifyLocations.map((loc) => {
                          const owner = taken.find((t) => t.shopifyLocationId === loc.id);
                          return {
                            label: owner
                              ? `${loc.name} — already used by ${owner.name}`
                              : loc.fulfillsOnlineOrders
                                ? loc.name
                                : `${loc.name} — doesn't fulfill online orders`,
                            value: loc.id,
                            disabled: Boolean(owner),
                          };
                        }),
                      ]}
                      value={shopifyLocationId}
                      onChange={setShopifyLocationId}
                      helpText="Shopify shows the pickup option at checkout per location, so each pickup point has to be one of your real store locations."
                    />
                    {!shopifyLocationId && (
                      <Banner tone="warning">
                        <Text as="p">
                          Until you link a Shopify location, this pickup point will not be
                          offered at checkout.
                        </Text>
                      </Banner>
                    )}
                    {shopifyLocationId &&
                      !shopifyLocations.find((l) => l.id === shopifyLocationId)
                        ?.fulfillsOnlineOrders && (
                        <Banner tone="warning" title="This location doesn't fulfill online orders">
                          <Text as="p">
                            Shopify will not offer it at checkout until you turn on
                            &quot;Fulfill online orders from this location&quot; in Settings →
                            Locations.
                          </Text>
                        </Banner>
                      )}
                    {shopifyLocationId &&
                      !shopifyLocations.find((l) => l.id === shopifyLocationId)
                        ?.hasMappableAddress && (
                        <Banner tone="critical" title="This Shopify location has no street address">
                          <Text as="p">
                            Shopify finds pickup locations by how close they are to the customer,
                            so a location without a full street address is never offered — the
                            customer just sees &quot;No locations with your item&quot;, even
                            though pickup is switched on and the item is in stock. Add the street
                            address in Settings → Locations.
                          </Text>
                        </Banner>
                      )}
                    <Banner tone="info">
                      <BlockStack gap="200">
                        <Text as="p">
                          Customers will see &quot;{pickupTimeLabel(prepTimeToPickupTime(parseInt(prepTime) || 60))}&quot;
                          at checkout. Shopify only offers a fixed set of times, so we round your
                          preparation time up to the nearest one. Your own emails and dashboard
                          still use the exact time.
                        </Text>
                        <Text as="p" tone="subdued">
                          Shopify only offers this location when the items ordered can be
                          supplied there, so keep inventory at this location up to date (or leave
                          inventory untracked).
                        </Text>
                      </BlockStack>
                    </Banner>
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Collection settings</Text>
              <Select
                label="Order preparation time"
                options={prepTimeOptions}
                value={prepTime}
                onChange={setPrepTime}
                helpText="How long after an order is placed before it's ready to collect."
              />
              <TextField
                label="Collection instructions"
                value={instructions}
                onChange={setInstructions}
                multiline={3}
                autoComplete="off"
                placeholder="e.g. Head to the service desk on Level 1 with your order number."
                helpText="Shown to customers in the ready-to-collect email and on their order page."
              />
              <Checkbox
                label="Location is active"
                checked={isActive}
                onChange={setIsActive}
                helpText="Inactive locations won't appear as options at checkout."
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Pickup service fee</Text>
              <Text as="p" tone="subdued">
                Charge a fee for packing and preparing orders for collection, like supermarkets and electronics retailers.
              </Text>
              <Select
                label="Fee type"
                options={[
                  { label: "Free pickup", value: "free" },
                  { label: "Fixed fee", value: "fixed" },
                  { label: "Percentage of order total", value: "percentage" },
                ]}
                value={serviceFeeType}
                onChange={setServiceFeeType}
              />
              {serviceFeeType !== "free" && (
                <>
                  <InlineGrid columns={2} gap="400">
                    <TextField
                      label={serviceFeeType === "fixed" ? "Fee amount ($)" : "Fee percentage (%)"}
                      value={serviceFeeAmount}
                      onChange={setServiceFeeAmount}
                      type="number"
                      autoComplete="off"
                      placeholder={serviceFeeType === "fixed" ? "5.00" : "3"}
                    />
                    <TextField
                      label="Free above order total ($)"
                      value={serviceFeeFreeAbove}
                      onChange={setServiceFeeFreeAbove}
                      type="number"
                      autoComplete="off"
                      placeholder="0"
                      helpText="Set to 0 to always charge. Otherwise fee is waived for orders above this amount."
                    />
                  </InlineGrid>
                  <TextField
                    label="Fee label (shown to customer)"
                    value={serviceFeeLabel}
                    onChange={setServiceFeeLabel}
                    autoComplete="off"
                    placeholder="Packing fee"
                    helpText="Leave blank for default: 'Pickup service fee'"
                  />
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Store hours</Text>
              <Text as="p" tone="subdued">Shown to customers so they know when to collect.</Text>
              {DAYS.map((day) => {
                const h = hours[day] ?? { open: "09:00", close: "17:00", closed: false };
                return (
                  <Box key={day}>
                    <InlineStack align="start" gap="400" wrap={false}>
                      <Box minWidth="100px">
                        <Text variant="bodyMd" fontWeight="medium" as="span">{DAY_LABELS[day]}</Text>
                      </Box>
                      <Checkbox
                        label="Closed"
                        checked={h.closed}
                        onChange={(val) => setDayHours(day, "closed", val)}
                      />
                      {!h.closed && (
                        <InlineStack gap="200" align="center">
                          <TextField
                            label="Open"
                            labelHidden
                            type="time"
                            value={h.open}
                            onChange={(val) => setDayHours(day, "open", val)}
                            autoComplete="off"
                          />
                          <Text as="span" tone="subdued">to</Text>
                          <TextField
                            label="Close"
                            labelHidden
                            type="time"
                            value={h.close}
                            onChange={(val) => setDayHours(day, "close", val)}
                            autoComplete="off"
                          />
                        </InlineStack>
                      )}
                    </InlineStack>
                  </Box>
                );
              })}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
