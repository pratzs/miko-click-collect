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

  if (id === "new") {
    return json({ location: null });
  }

  const location = await db.pickupLocation.findFirst({ where: { id, shop } });
  if (!location) throw new Response("Not found", { status: 404 });

  return json({
    location: {
      id: location.id,
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
    await db.pickupLocation.deleteMany({ where: { id: id!, shop } });
    return redirect("/app/locations");
  }

  const name = (form.get("name") as string).trim();
  if (!name) return json({ error: "Location name is required." }, { status: 400 });

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
    prepTimeMinutes: parseInt(form.get("prepTimeMinutes") as string) || 60,
    collectionInstructions: (form.get("collectionInstructions") as string) || "",
    isActive: form.get("isActive") === "true",
  };

  if (id === "new") {
    await db.pickupLocation.create({ data });
  } else {
    await db.pickupLocation.updateMany({ where: { id, shop }, data });
  }

  return redirect("/app/locations");
};

export default function LocationFormPage() {
  const { location } = useLoaderData<typeof loader>();
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
                          <Text as="span" tone="subdued">–</Text>
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
