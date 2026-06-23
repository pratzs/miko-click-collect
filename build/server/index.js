var _a;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { RemixServer, Meta, Links, Outlet, ScrollRestoration, Scripts, useRouteError, useLoaderData, useNavigate, useFetcher, useSearchParams, useLocation } from "@remix-run/react";
import { createReadableStreamFromReadable, json, redirect } from "@remix-run/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-remix/adapters/node";
import { shopifyApp, BillingInterval, AppDistribution, ApiVersion } from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { Page, Box, Banner, Layout, Card, BlockStack, Text, TextField, InlineGrid, Select, Checkbox, InlineStack, Badge, Divider, Button, Modal, EmptyState, Tabs, Filters, ChoiceList } from "@shopify/polaris";
import { useState } from "react";
import nodemailer from "nodemailer";
import { format } from "date-fns";
import { useAppBridge, NavMenu } from "@shopify/app-bridge-react";
import { CheckIcon, AlertCircleIcon, CheckCircleIcon, OrderIcon } from "@shopify/polaris-icons";
import { AppProvider } from "@shopify/shopify-app-remix/react";
const ABORT_DELAY = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return isbot(request.headers.get("user-agent") || "") ? handleBotRequest(request, responseStatusCode, responseHeaders, remixContext) : handleBrowserRequest(request, responseStatusCode, responseHeaders, remixContext);
}
function handleBotRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return new Promise((resolve, reject) => {
    let didError = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(RemixServer, { context: remixContext, url: request.url, abortDelay: ABORT_DELAY }),
      {
        onAllReady() {
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          didError = true;
          console.error(error);
        }
      }
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
function handleBrowserRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return new Promise((resolve, reject) => {
    let didError = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(RemixServer, { context: remixContext, url: request.url, abortDelay: ABORT_DELAY }),
      {
        onShellReady() {
          const body = new PassThrough();
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(createReadableStreamFromReadable(body), {
              headers: responseHeaders,
              status: didError ? 500 : responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          didError = true;
          console.error(error);
        }
      }
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest
}, Symbol.toStringTag, { value: "Module" }));
const db = global.prismaClient || new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  global.prismaClient = db;
}
async function ensureShopConfig(shop, accessToken) {
  var _a2;
  const existing = await db.shopConfig.findUnique({ where: { shop } });
  if (existing) {
    await db.shopConfig.update({
      where: { shop },
      data: { accessToken }
    });
    return existing;
  }
  let shopName = shop;
  try {
    const res = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken }
    });
    if (res.ok) {
      const data = await res.json();
      shopName = ((_a2 = data.shop) == null ? void 0 : _a2.name) || shop;
    }
  } catch {
  }
  return db.shopConfig.create({
    data: {
      shop,
      accessToken,
      shopName,
      brandName: shopName,
      senderName: shopName
    }
  });
}
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionStorage: new PrismaSessionStorage(db),
  distribution: AppDistribution.AppStore,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  billing: {
    starter: {
      trialDays: 14,
      test: process.env.SHOPIFY_BILLING_TEST !== "false",
      lineItems: [{ amount: 9.95, currencyCode: "USD", interval: BillingInterval.Every30Days }]
    },
    growth: {
      trialDays: 14,
      test: process.env.SHOPIFY_BILLING_TEST !== "false",
      lineItems: [{ amount: 29.95, currencyCode: "USD", interval: BillingInterval.Every30Days }]
    }
  },
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });
      await ensureShopConfig(session.shop, session.accessToken ?? "");
    }
  }
});
ApiVersion.April26;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const loader$c = async ({ request }) => {
  const responseHeaders = new Headers();
  addDocumentResponseHeaders(request, responseHeaders);
  return json(null, { headers: responseHeaders });
};
const headers = ({ loaderHeaders }) => {
  return loaderHeaders;
};
function App$1() {
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width,initial-scale=1" }),
      /* @__PURE__ */ jsx(Meta, {}),
      /* @__PURE__ */ jsx(Links, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx(Outlet, {}),
      /* @__PURE__ */ jsx(ScrollRestoration, {}),
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
function ErrorBoundary() {
  const error = useRouteError();
  if (error instanceof Response && (error.status === 401 || error.status === 302)) {
    return null;
  }
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width,initial-scale=1" }),
      /* @__PURE__ */ jsx("title", { children: "Something went wrong" })
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsxs("div", { style: { padding: "2rem", fontFamily: "sans-serif", textAlign: "center" }, children: [
        /* @__PURE__ */ jsx("h1", { children: "Something went wrong" }),
        /* @__PURE__ */ jsx("p", { children: "Please refresh or return to the app from your Shopify admin." })
      ] }),
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: App$1,
  headers,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
const action$a = async ({ request }) => {
  await authenticate.webhook(request);
  return json({ ok: true });
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a
}, Symbol.toStringTag, { value: "Module" }));
const action$9 = async ({ request }) => {
  await authenticate.webhook(request);
  return json({ ok: true });
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9
}, Symbol.toStringTag, { value: "Module" }));
const action$8 = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CANCELLED") return json({ ok: true });
  const order = payload;
  await db.clickCollectOrder.updateMany({
    where: { shop, shopifyOrderId: String(order.id), status: { in: ["pending", "ready"] } },
    data: { status: "cancelled" }
  });
  return json({ ok: true });
};
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
const action$7 = async ({ request }) => {
  const { shop } = await authenticate.webhook(request);
  await db.shopConfig.updateMany({
    where: { shop },
    data: { subscriptionCancelledAt: /* @__PURE__ */ new Date() }
  });
  return json({ ok: true });
};
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7
}, Symbol.toStringTag, { value: "Module" }));
const loader$b = async ({ request }) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const plan = url.searchParams.get("plan");
  if (!plan || !["starter", "growth"].includes(plan)) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }
  const isTest = process.env.SHOPIFY_BILLING_TEST !== "false";
  try {
    const result = await billing.request({
      plan,
      isTest,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing?subscribed=${plan}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    });
    await db.shopConfig.update({
      where: { shop },
      data: {
        planName: plan,
        trialStartedAt: /* @__PURE__ */ new Date()
      }
    });
    return json({ confirmationUrl: (result == null ? void 0 : result.confirmationUrl) ?? null });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
const loader$a = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop) {
    return json({ locations: [] }, {
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  }
  const locations = await db.pickupLocation.findMany({
    where: { shop, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      address: true,
      city: true,
      postcode: true,
      phone: true,
      hours: true,
      prepTimeMinutes: true,
      collectionInstructions: true
    }
  });
  return json(
    { locations },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=60"
      }
    }
  );
};
const action$6 = async ({ request }) => {
  return json({}, { headers: { "Access-Control-Allow-Origin": "*" } });
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
const ATTR_PICKUP = "miko_pickup_method";
const ATTR_LOCATION_ID = "miko_location_id";
const action$5 = async ({ request }) => {
  var _a2, _b, _c, _d, _e, _f;
  const { topic, shop, payload } = await authenticate.webhook(request);
  if (topic !== "ORDERS_PAID") return json({ ok: true });
  const order = payload;
  const attrs = new Map(((_a2 = order.note_attributes) == null ? void 0 : _a2.map((a) => [a.name, a.value])) ?? []);
  if (attrs.get(ATTR_PICKUP) !== "click_and_collect") return json({ ok: true });
  const locationId = attrs.get(ATTR_LOCATION_ID);
  if (!locationId) return json({ ok: true });
  const location = await db.pickupLocation.findFirst({ where: { id: locationId, shop } });
  if (!location) return json({ ok: true });
  const customerName = [(_b = order.customer) == null ? void 0 : _b.first_name, (_c = order.customer) == null ? void 0 : _c.last_name].filter(Boolean).join(" ");
  const customerEmail = ((_d = order.customer) == null ? void 0 : _d.email) ?? order.email ?? "";
  const customerPhone = ((_e = order.customer) == null ? void 0 : _e.phone) ?? ((_f = order.billing_address) == null ? void 0 : _f.phone) ?? order.phone ?? "";
  const lineItems = (order.line_items ?? []).map((li) => ({
    title: li.variant_title ? `${li.title} – ${li.variant_title}` : li.title,
    quantity: li.quantity,
    price: li.price
  }));
  await db.clickCollectOrder.upsert({
    where: {
      shop_shopifyOrderId: {
        shop,
        shopifyOrderId: String(order.id)
      }
    },
    create: {
      shop,
      shopifyOrderId: String(order.id),
      shopifyOrderName: order.name,
      shopifyOrderGid: order.admin_graphql_api_id ?? "",
      pickupLocationId: location.id,
      customerName,
      customerEmail,
      customerPhone,
      lineItemsJson: lineItems,
      totalPrice: order.total_price ?? "",
      currency: order.currency ?? "",
      status: "pending"
    },
    update: {
      // If it already existed (duplicate webhook), don't reset status
      shopifyOrderName: order.name,
      customerName,
      customerEmail,
      customerPhone
    }
  });
  return json({ ok: true });
};
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5
}, Symbol.toStringTag, { value: "Module" }));
const action$4 = async ({ request }) => {
  await authenticate.webhook(request);
  return json({ ok: true });
};
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};
function defaultHours() {
  return Object.fromEntries(
    DAYS.map((d) => [d, { open: "09:00", close: "17:00", closed: d === "sat" || d === "sun" }])
  );
}
const loader$9 = async ({ request, params }) => {
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
      hours: location.hours,
      prepTimeMinutes: location.prepTimeMinutes,
      collectionInstructions: location.collectionInstructions,
      isActive: location.isActive
    }
  });
};
const action$3 = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const form = await request.formData();
  const intent = form.get("intent");
  if (intent === "delete") {
    await db.pickupLocation.deleteMany({ where: { id, shop } });
    return redirect("/app/locations");
  }
  const name = form.get("name").trim();
  if (!name) return json({ error: "Location name is required." }, { status: 400 });
  const hoursRaw = form.get("hours");
  let hours;
  try {
    hours = JSON.parse(hoursRaw);
  } catch {
    hours = defaultHours();
  }
  const data = {
    shop,
    name,
    address: form.get("address") || "",
    city: form.get("city") || "",
    postcode: form.get("postcode") || "",
    phone: form.get("phone") || "",
    email: form.get("email") || "",
    hours,
    prepTimeMinutes: parseInt(form.get("prepTimeMinutes")) || 60,
    collectionInstructions: form.get("collectionInstructions") || "",
    isActive: form.get("isActive") === "true"
  };
  if (id === "new") {
    await db.pickupLocation.create({ data });
  } else {
    await db.pickupLocation.updateMany({ where: { id, shop }, data });
  }
  return redirect("/app/locations");
};
function LocationFormPage() {
  var _a2;
  const { location } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const isNew = !location;
  const [name, setName] = useState((location == null ? void 0 : location.name) ?? "");
  const [address, setAddress] = useState((location == null ? void 0 : location.address) ?? "");
  const [city, setCity] = useState((location == null ? void 0 : location.city) ?? "");
  const [postcode, setPostcode] = useState((location == null ? void 0 : location.postcode) ?? "");
  const [phone, setPhone] = useState((location == null ? void 0 : location.phone) ?? "");
  const [email, setEmail] = useState((location == null ? void 0 : location.email) ?? "");
  const [prepTime, setPrepTime] = useState(String((location == null ? void 0 : location.prepTimeMinutes) ?? 60));
  const [instructions, setInstructions] = useState((location == null ? void 0 : location.collectionInstructions) ?? "");
  const [isActive, setIsActive] = useState((location == null ? void 0 : location.isActive) ?? true);
  const [hours, setHours] = useState(
    (location == null ? void 0 : location.hours) ?? defaultHours()
  );
  const isSubmitting = fetcher.state !== "idle";
  function setDayHours(day, field, value) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }
  function submit(extra) {
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
    { label: "Next day", value: "1440" }
  ];
  return /* @__PURE__ */ jsxs(
    Page,
    {
      title: isNew ? "Add Pickup Location" : `Edit: ${location.name}`,
      backAction: { content: "Locations", onAction: () => navigate("/app/locations") },
      primaryAction: {
        content: isNew ? "Add location" : "Save changes",
        loading: isSubmitting,
        onAction: () => submit()
      },
      secondaryActions: !isNew ? [
        {
          content: "Delete location",
          destructive: true,
          onAction: () => {
            if (confirm("Delete this location? This cannot be undone.")) submit({ intent: "delete" });
          }
        }
      ] : [],
      children: [
        ((_a2 = fetcher.data) == null ? void 0 : _a2.error) && /* @__PURE__ */ jsx(Box, { paddingBlockEnd: "400", children: /* @__PURE__ */ jsx(Banner, { tone: "critical", children: fetcher.data.error }) }),
        /* @__PURE__ */ jsxs(Layout, { children: [
          /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
            /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Location details" }),
            /* @__PURE__ */ jsx(TextField, { label: "Location name *", value: name, onChange: setName, autoComplete: "off", placeholder: "e.g. Auckland CBD Store" }),
            /* @__PURE__ */ jsx(TextField, { label: "Street address", value: address, onChange: setAddress, autoComplete: "off", placeholder: "123 Queen Street" }),
            /* @__PURE__ */ jsxs(InlineGrid, { columns: 2, gap: "400", children: [
              /* @__PURE__ */ jsx(TextField, { label: "City", value: city, onChange: setCity, autoComplete: "off", placeholder: "Auckland" }),
              /* @__PURE__ */ jsx(TextField, { label: "Postcode", value: postcode, onChange: setPostcode, autoComplete: "off", placeholder: "1010" })
            ] }),
            /* @__PURE__ */ jsxs(InlineGrid, { columns: 2, gap: "400", children: [
              /* @__PURE__ */ jsx(TextField, { label: "Phone", value: phone, onChange: setPhone, autoComplete: "off", type: "tel", placeholder: "+64 9 123 4567" }),
              /* @__PURE__ */ jsx(TextField, { label: "Email", value: email, onChange: setEmail, autoComplete: "off", type: "email", placeholder: "store@example.co.nz" })
            ] })
          ] }) }) }),
          /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
            /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Collection settings" }),
            /* @__PURE__ */ jsx(
              Select,
              {
                label: "Order preparation time",
                options: prepTimeOptions,
                value: prepTime,
                onChange: setPrepTime,
                helpText: "How long after an order is placed before it's ready to collect."
              }
            ),
            /* @__PURE__ */ jsx(
              TextField,
              {
                label: "Collection instructions",
                value: instructions,
                onChange: setInstructions,
                multiline: 3,
                autoComplete: "off",
                placeholder: "e.g. Head to the service desk on Level 1 with your order number.",
                helpText: "Shown to customers in the ready-to-collect email and on their order page."
              }
            ),
            /* @__PURE__ */ jsx(
              Checkbox,
              {
                label: "Location is active",
                checked: isActive,
                onChange: setIsActive,
                helpText: "Inactive locations won't appear as options at checkout."
              }
            )
          ] }) }) }),
          /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
            /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Store hours" }),
            /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: "Shown to customers so they know when to collect." }),
            DAYS.map((day) => {
              const h = hours[day] ?? { open: "09:00", close: "17:00", closed: false };
              return /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(InlineStack, { align: "start", gap: "400", wrap: false, children: [
                /* @__PURE__ */ jsx(Box, { minWidth: "100px", children: /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "medium", as: "span", children: DAY_LABELS[day] }) }),
                /* @__PURE__ */ jsx(
                  Checkbox,
                  {
                    label: "Closed",
                    checked: h.closed,
                    onChange: (val) => setDayHours(day, "closed", val)
                  }
                ),
                !h.closed && /* @__PURE__ */ jsxs(InlineStack, { gap: "200", align: "center", children: [
                  /* @__PURE__ */ jsx(
                    TextField,
                    {
                      label: "Open",
                      labelHidden: true,
                      type: "time",
                      value: h.open,
                      onChange: (val) => setDayHours(day, "open", val),
                      autoComplete: "off"
                    }
                  ),
                  /* @__PURE__ */ jsx(Text, { as: "span", tone: "subdued", children: "–" }),
                  /* @__PURE__ */ jsx(
                    TextField,
                    {
                      label: "Close",
                      labelHidden: true,
                      type: "time",
                      value: h.close,
                      onChange: (val) => setDayHours(day, "close", val),
                      autoComplete: "off"
                    }
                  )
                ] })
              ] }) }, day);
            })
          ] }) }) })
        ] })
      ]
    }
  );
}
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3,
  default: LocationFormPage,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
function getTransporter(config) {
  if (config.smtpHost && config.smtpUser && config.smtpPass) {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass }
    });
  }
  if (process.env.NODE_ENV !== "production") {
    return nodemailer.createTransport({ host: "localhost", port: 1025, ignoreTLS: true });
  }
  throw new Error("No SMTP configured");
}
function brandColor(config) {
  return config.brandPrimaryColor || "#1a1a1a";
}
function logoBlock(config) {
  if (config.brandLogoUrl) {
    return `<img src="${config.brandLogoUrl}" alt="${config.brandName || config.shopName}" style="max-height:48px;max-width:200px;" />`;
  }
  return `<span style="font-size:22px;font-weight:700;color:${brandColor(config)};">${config.brandName || config.shopName || "Your Store"}</span>`;
}
async function sendReadyToCollectEmail(config, order) {
  if (!config.replyToEmail && !config.smtpHost) return false;
  const location = order.pickupLocation;
  const subject = config.notifyReadySubject || "Your order is ready for collection! 🛍️";
  const color = brandColor(config);
  const fromName = config.smtpFromName || config.senderName || config.shopName || "Your Store";
  const fromEmail = config.smtpFromEmail || config.replyToEmail;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr><td style="background:${color};padding:32px 40px;text-align:center;">
          ${logoBlock(config)}
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:26px;color:#1a1a1a;">Ready for collection! ✅</h1>
          <p style="color:#555;margin:0 0 24px;">Hi ${order.customerName || "there"}, great news — your order is ready to collect.</p>

          <!-- Order box -->
          <div style="background:#f8f8f8;border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.05em;">Order</p>
            <p style="margin:0;font-size:20px;font-weight:700;color:#1a1a1a;">${order.shopifyOrderName}</p>
          </div>

          <!-- Pickup location -->
          <div style="border:2px solid ${color};border-radius:8px;padding:20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:.05em;">Collect from</p>
            <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#1a1a1a;">${location.name}</p>
            ${location.address ? `<p style="margin:0 0 2px;color:#555;">${location.address}</p>` : ""}
            ${location.city ? `<p style="margin:0 0 2px;color:#555;">${location.city}${location.postcode ? ` ${location.postcode}` : ""}</p>` : ""}
            ${location.phone ? `<p style="margin:0;color:#555;">📞 ${location.phone}</p>` : ""}
          </div>

          ${location.collectionInstructions ? `
          <div style="background:#fffbe6;border-radius:8px;padding:16px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-weight:600;color:#1a1a1a;">Collection instructions</p>
            <p style="margin:0;color:#555;">${location.collectionInstructions}</p>
          </div>` : ""}

          <p style="color:#888;font-size:13px;margin:0;">Please bring your order confirmation or ID when collecting. We look forward to seeing you!</p>
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:12px;">© ${(/* @__PURE__ */ new Date()).getFullYear()} ${config.brandName || config.shopName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  try {
    const transporter = getTransporter(config);
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: order.customerEmail,
      ...config.notifyMerchantEmail ? { bcc: config.notifyMerchantEmail } : {},
      subject,
      html
    });
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "ready_to_collect",
        recipientEmail: order.customerEmail,
        subject,
        status: "sent"
      }
    });
    return true;
  } catch (err) {
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "ready_to_collect",
        recipientEmail: order.customerEmail,
        subject,
        status: "failed",
        errorMessage: String(err)
      }
    });
    return false;
  }
}
async function sendPickedUpEmail(config, order) {
  if (!config.replyToEmail && !config.smtpHost) return false;
  const subject = config.notifyPickedUpSubject || "Thanks for collecting your order!";
  const color = brandColor(config);
  const fromName = config.smtpFromName || config.senderName || config.shopName || "Your Store";
  const fromEmail = config.smtpFromEmail || config.replyToEmail;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${color};padding:32px 40px;text-align:center;">${logoBlock(config)}</td></tr>
        <tr><td style="padding:40px;">
          <h1 style="margin:0 0 8px;font-size:26px;color:#1a1a1a;">Thank you! 🎉</h1>
          <p style="color:#555;margin:0 0 24px;">Hi ${order.customerName || "there"}, your order ${order.shopifyOrderName} has been collected. Enjoy!</p>
          <p style="color:#888;font-size:13px;margin:0;">If you have any questions, feel free to reply to this email or contact us.</p>
        </td></tr>
        <tr><td style="padding:24px 40px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:12px;">© ${(/* @__PURE__ */ new Date()).getFullYear()} ${config.brandName || config.shopName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  try {
    const transporter = getTransporter(config);
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: order.customerEmail,
      subject,
      html
    });
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "picked_up",
        recipientEmail: order.customerEmail,
        subject,
        status: "sent"
      }
    });
    return true;
  } catch (err) {
    await db.emailLog.create({
      data: {
        shop: config.shop,
        orderId: order.id,
        type: "picked_up",
        recipientEmail: order.customerEmail,
        subject,
        status: "failed",
        errorMessage: String(err)
      }
    });
    return false;
  }
}
const loader$8 = async ({ request, params }) => {
  var _a2, _b, _c, _d;
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const order = await db.clickCollectOrder.findFirst({
    where: { id, shop },
    include: {
      pickupLocation: true,
      shopConfig: true
    }
  });
  if (!order) throw new Response("Not found", { status: 404 });
  const emailLogs = await db.emailLog.findMany({
    where: { shop, orderId: id },
    orderBy: { sentAt: "desc" }
  });
  const lineItems = Array.isArray(order.lineItemsJson) ? order.lineItemsJson : [];
  return json({
    order: {
      id: order.id,
      orderName: order.shopifyOrderName,
      shopifyOrderGid: order.shopifyOrderGid,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      status: order.status,
      totalPrice: order.totalPrice,
      currency: order.currency,
      merchantNotes: order.merchantNotes,
      expectedReadyAt: ((_a2 = order.expectedReadyAt) == null ? void 0 : _a2.toISOString()) ?? null,
      readyAt: ((_b = order.readyAt) == null ? void 0 : _b.toISOString()) ?? null,
      pickedUpAt: ((_c = order.pickedUpAt) == null ? void 0 : _c.toISOString()) ?? null,
      readyNotificationSentAt: ((_d = order.readyNotificationSentAt) == null ? void 0 : _d.toISOString()) ?? null,
      createdAt: order.createdAt.toISOString(),
      lineItems
    },
    location: {
      id: order.pickupLocation.id,
      name: order.pickupLocation.name,
      address: order.pickupLocation.address,
      city: order.pickupLocation.city,
      postcode: order.pickupLocation.postcode,
      phone: order.pickupLocation.phone,
      collectionInstructions: order.pickupLocation.collectionInstructions
    },
    emailLogs: emailLogs.map((l) => ({
      id: l.id,
      type: l.type,
      recipientEmail: l.recipientEmail,
      subject: l.subject,
      status: l.status,
      sentAt: l.sentAt.toISOString()
    })),
    hasEmail: Boolean(order.shopConfig.replyToEmail || order.shopConfig.smtpHost)
  });
};
const action$2 = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const { id } = params;
  const form = await request.formData();
  const intent = form.get("intent");
  const order = await db.clickCollectOrder.findFirst({
    where: { id, shop },
    include: { pickupLocation: true, shopConfig: true }
  });
  if (!order) return json({ error: "Order not found" }, { status: 404 });
  if (intent === "mark_ready") {
    await db.clickCollectOrder.update({
      where: { id },
      data: {
        status: "ready",
        readyAt: /* @__PURE__ */ new Date()
      }
    });
    let emailSent = false;
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      emailSent = await sendReadyToCollectEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation
      });
      if (emailSent) {
        await db.clickCollectOrder.update({
          where: { id },
          data: { readyNotificationSentAt: /* @__PURE__ */ new Date() }
        });
      }
    }
    return json({ ok: true, emailSent, message: emailSent ? "Order marked ready. Notification sent!" : "Order marked ready." });
  }
  if (intent === "mark_picked_up") {
    await db.clickCollectOrder.update({
      where: { id },
      data: { status: "picked_up", pickedUpAt: /* @__PURE__ */ new Date() }
    });
    let emailSent = false;
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      emailSent = await sendPickedUpEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation
      });
    }
    return json({ ok: true, emailSent, message: "Order marked as collected!" });
  }
  if (intent === "save_notes") {
    const notes = form.get("notes");
    await db.clickCollectOrder.update({ where: { id }, data: { merchantNotes: notes } });
    return json({ ok: true, message: "Notes saved." });
  }
  if (intent === "resend_ready") {
    if (order.shopConfig.replyToEmail || order.shopConfig.smtpHost) {
      const emailSent = await sendReadyToCollectEmail(order.shopConfig, {
        ...order,
        pickupLocation: order.pickupLocation
      });
      return json({ ok: true, emailSent, message: emailSent ? "Notification resent!" : "Email not configured." });
    }
    return json({ ok: false, message: "Configure email in Settings first." });
  }
  return json({ error: "Unknown intent" }, { status: 400 });
};
const STATUS_BADGE$2 = {
  pending: { tone: "attention", label: "Pending" },
  ready: { tone: "info", label: "Ready to collect" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" }
};
function OrderDetailPage() {
  var _a2;
  const { order, location, emailLogs, hasEmail } = useLoaderData();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [notes, setNotes] = useState(order.merchantNotes);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const badge = STATUS_BADGE$2[order.status] ?? { tone: "attention", label: order.status };
  const isSubmitting = fetcher.state !== "idle";
  function submitAction(intent, extra) {
    const fd = new FormData();
    fd.set("intent", intent);
    if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    fetcher.submit(fd, { method: "POST" });
  }
  function openConfirm(action2) {
    setConfirmAction(action2);
    setConfirmModalOpen(true);
  }
  function doConfirm() {
    if (confirmAction) submitAction(confirmAction);
    setConfirmModalOpen(false);
  }
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  return /* @__PURE__ */ jsxs(
    Page,
    {
      title: `Order ${order.orderName}`,
      backAction: { content: "Orders", onAction: () => navigate("/app/orders") },
      children: [
        ((_a2 = fetcher.data) == null ? void 0 : _a2.message) && /* @__PURE__ */ jsx(Box, { paddingBlockEnd: "400", children: /* @__PURE__ */ jsx(Banner, { tone: fetcher.data.ok ? "success" : "warning", children: fetcher.data.message }) }),
        /* @__PURE__ */ jsxs(Layout, { children: [
          /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
            /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
              /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
                /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
                  /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: order.orderName }),
                  /* @__PURE__ */ jsx(Badge, { tone: badge.tone, children: badge.label })
                ] }),
                /* @__PURE__ */ jsx(Text, { variant: "bodySm", tone: "subdued", as: "p", children: format(new Date(order.createdAt), "d MMM yyyy, h:mm a") })
              ] }),
              /* @__PURE__ */ jsx(Divider, {}),
              /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
                order.status === "pending" && /* @__PURE__ */ jsx(
                  Button,
                  {
                    variant: "primary",
                    size: "large",
                    fullWidth: true,
                    loading: isSubmitting && confirmAction === "mark_ready",
                    onClick: () => openConfirm("mark_ready"),
                    children: "✅ Mark as Ready to Collect"
                  }
                ),
                order.status === "ready" && /* @__PURE__ */ jsxs(Fragment, { children: [
                  /* @__PURE__ */ jsx(
                    Button,
                    {
                      variant: "primary",
                      size: "large",
                      fullWidth: true,
                      loading: isSubmitting && confirmAction === "mark_picked_up",
                      onClick: () => openConfirm("mark_picked_up"),
                      children: "🛍️ Mark as Picked Up"
                    }
                  ),
                  hasEmail && /* @__PURE__ */ jsx(
                    Button,
                    {
                      variant: "plain",
                      fullWidth: true,
                      loading: isSubmitting,
                      onClick: () => submitAction("resend_ready"),
                      children: 'Resend "Ready" notification'
                    }
                  )
                ] }),
                order.status === "picked_up" && /* @__PURE__ */ jsxs(Banner, { tone: "success", children: [
                  "Collected ",
                  order.pickedUpAt ? format(new Date(order.pickedUpAt), "d MMM yyyy h:mm a") : ""
                ] })
              ] }),
              (order.readyAt || order.pickedUpAt) && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Divider, {}),
                /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
                  /* @__PURE__ */ jsx(Text, { variant: "headingSm", as: "h3", children: "Timeline" }),
                  /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [
                    "📦 Order received: ",
                    format(new Date(order.createdAt), "d MMM yyyy h:mm a")
                  ] }),
                  order.readyAt && /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [
                    "✅ Marked ready: ",
                    format(new Date(order.readyAt), "d MMM yyyy h:mm a"),
                    order.readyNotificationSentAt ? " · Notification sent" : " · No notification sent"
                  ] }),
                  order.pickedUpAt && /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [
                    "🛍️ Collected: ",
                    format(new Date(order.pickedUpAt), "d MMM yyyy h:mm a")
                  ] })
                ] })
              ] })
            ] }) }),
            lineItems.length > 0 && /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Items" }),
              /* @__PURE__ */ jsx(Divider, {}),
              lineItems.map((item, i) => /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
                /* @__PURE__ */ jsx(Text, { as: "p", children: item.title }),
                /* @__PURE__ */ jsxs(InlineStack, { gap: "300", children: [
                  /* @__PURE__ */ jsxs(Text, { as: "p", tone: "subdued", children: [
                    "×",
                    item.quantity
                  ] }),
                  /* @__PURE__ */ jsx(Text, { as: "p", children: item.price })
                ] })
              ] }) }, i)),
              /* @__PURE__ */ jsx(Divider, {}),
              /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
                /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "p", children: "Total" }),
                /* @__PURE__ */ jsxs(Text, { variant: "bodyMd", fontWeight: "semibold", as: "p", children: [
                  order.currency,
                  " ",
                  order.totalPrice
                ] })
              ] })
            ] }) }),
            /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Internal notes" }),
              /* @__PURE__ */ jsx(
                TextField,
                {
                  label: "Notes",
                  labelHidden: true,
                  value: notes,
                  onChange: setNotes,
                  multiline: 3,
                  autoComplete: "off",
                  placeholder: "Notes visible only to you..."
                }
              ),
              /* @__PURE__ */ jsx(
                Button,
                {
                  onClick: () => submitAction("save_notes", { notes }),
                  loading: isSubmitting,
                  children: "Save notes"
                }
              )
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx(Layout.Section, { variant: "oneThird", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
            /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Customer" }),
              /* @__PURE__ */ jsx(Text, { as: "p", children: order.customerName || "—" }),
              order.customerEmail && /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: order.customerEmail }),
              order.customerPhone && /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: order.customerPhone })
            ] }) }),
            /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Pickup location" }),
              /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "p", children: location.name }),
              location.address && /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: location.address }),
              location.city && /* @__PURE__ */ jsxs(Text, { as: "p", tone: "subdued", children: [
                location.city,
                location.postcode ? ` ${location.postcode}` : ""
              ] }),
              location.phone && /* @__PURE__ */ jsxs(Text, { as: "p", tone: "subdued", children: [
                "📞 ",
                location.phone
              ] }),
              location.collectionInstructions && /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(Divider, {}),
                /* @__PURE__ */ jsx(Text, { variant: "bodySm", tone: "subdued", as: "p", children: location.collectionInstructions })
              ] })
            ] }) }),
            emailLogs.length > 0 && /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Notifications" }),
              emailLogs.map((log) => /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
                /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
                  /* @__PURE__ */ jsx(Text, { variant: "bodySm", as: "p", fontWeight: "semibold", children: log.type === "ready_to_collect" ? "Ready notification" : "Collected confirmation" }),
                  /* @__PURE__ */ jsx(Text, { variant: "bodySm", tone: "subdued", as: "p", children: format(new Date(log.sentAt), "d MMM h:mm a") })
                ] }),
                /* @__PURE__ */ jsx(Badge, { tone: log.status === "sent" ? "success" : "critical", children: log.status })
              ] }) }, log.id))
            ] }) })
          ] }) })
        ] }),
        /* @__PURE__ */ jsx(
          Modal,
          {
            open: confirmModalOpen,
            onClose: () => setConfirmModalOpen(false),
            title: confirmAction === "mark_ready" ? "Mark order as ready?" : "Mark order as collected?",
            primaryAction: {
              content: confirmAction === "mark_ready" ? "Mark Ready & Notify Customer" : "Mark as Collected",
              onAction: doConfirm
            },
            secondaryActions: [{ content: "Cancel", onAction: () => setConfirmModalOpen(false) }],
            children: /* @__PURE__ */ jsx(Modal.Section, { children: confirmAction === "mark_ready" ? /* @__PURE__ */ jsxs(Text, { as: "p", children: [
              "This will mark order ",
              /* @__PURE__ */ jsx("strong", { children: order.orderName }),
              " as ready to collect",
              hasEmail ? " and send a notification email to the customer." : ". No email will be sent (configure email in Settings)."
            ] }) : /* @__PURE__ */ jsxs(Text, { as: "p", children: [
              "Confirm that ",
              /* @__PURE__ */ jsx("strong", { children: order.customerName || order.customerEmail }),
              " has collected order",
              " ",
              /* @__PURE__ */ jsx("strong", { children: order.orderName }),
              ". This action cannot be undone."
            ] }) })
          }
        )
      ]
    }
  );
}
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  default: OrderDetailPage,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const PLANS = {
  free: {
    name: "Free",
    price: 0,
    locationLimit: 1,
    orderLimit: 50,
    // orders per month
    badge: true,
    smtp: false
  },
  starter: {
    name: "Starter",
    price: 9.95,
    locationLimit: 3,
    orderLimit: 500,
    badge: false,
    smtp: true
  },
  growth: {
    name: "Growth",
    price: 29.95,
    locationLimit: 999,
    // unlimited
    orderLimit: 999999,
    // unlimited
    badge: false,
    smtp: true
  }
};
function getPlan(planName) {
  return PLANS[planName] ?? PLANS.free;
}
function canAddLocation(planName, currentCount) {
  return currentCount < getPlan(planName).locationLimit;
}
function hasSmtp(planName) {
  return getPlan(planName).smtp;
}
const loader$7 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [config, locations] = await Promise.all([
    db.shopConfig.findUnique({ where: { shop } }),
    db.pickupLocation.findMany({
      where: { shop },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    })
  ]);
  const planName = (config == null ? void 0 : config.planName) ?? "free";
  const plan = getPlan(planName);
  const activeCount = locations.filter((l) => l.isActive).length;
  const canAdd = canAddLocation(planName, activeCount);
  return json({
    locations: locations.map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      city: l.city,
      phone: l.phone,
      isActive: l.isActive,
      prepTimeMinutes: l.prepTimeMinutes
    })),
    plan,
    planName,
    activeCount,
    canAdd
  });
};
function LocationsPage() {
  const { locations, plan, planName, activeCount, canAdd } = useLoaderData();
  const navigate = useNavigate();
  return /* @__PURE__ */ jsx(
    Page,
    {
      title: "Pickup Locations",
      primaryAction: {
        content: "Add location",
        disabled: !canAdd,
        onAction: () => navigate("/app/locations/new")
      },
      children: /* @__PURE__ */ jsxs(Layout, { children: [
        !canAdd && /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(
          Banner,
          {
            title: `You've reached the ${plan.name} plan limit of ${plan.locationLimit} location${plan.locationLimit !== 1 ? "s" : ""}`,
            tone: "warning",
            action: { content: "Upgrade plan", onAction: () => navigate("/app/pricing") },
            children: /* @__PURE__ */ jsx("p", { children: "Upgrade to add more pickup locations." })
          }
        ) }),
        /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { padding: "0", children: locations.length === 0 ? /* @__PURE__ */ jsx(
          EmptyState,
          {
            heading: "Add your first pickup location",
            action: { content: "Add location", onAction: () => navigate("/app/locations/new") },
            image: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png",
            children: /* @__PURE__ */ jsx("p", { children: "Locations are where customers can collect their orders. Add your store addresses, warehouses, or distribution points." })
          }
        ) : /* @__PURE__ */ jsx(BlockStack, { gap: "0", children: locations.map((location, idx) => /* @__PURE__ */ jsxs(Box, { children: [
          idx > 0 && /* @__PURE__ */ jsx(Divider, {}),
          /* @__PURE__ */ jsx(Box, { padding: "400", children: /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", wrap: false, children: [
            /* @__PURE__ */ jsx(InlineStack, { gap: "400", align: "start", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
              /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
                /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "span", children: location.name }),
                /* @__PURE__ */ jsx(Badge, { tone: location.isActive ? "success" : "attention", children: location.isActive ? "Active" : "Inactive" })
              ] }),
              (location.address || location.city) && /* @__PURE__ */ jsx(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [location.address, location.city].filter(Boolean).join(", ") }),
              /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [
                "Ready in ",
                location.prepTimeMinutes < 60 ? `${location.prepTimeMinutes}min` : `${location.prepTimeMinutes / 60}hr`,
                location.phone ? ` · ${location.phone}` : ""
              ] })
            ] }) }),
            /* @__PURE__ */ jsx(Button, { variant: "plain", size: "slim", onClick: () => navigate(`/app/locations/${location.id}`), children: "Edit" })
          ] }) })
        ] }, location.id)) }) }) })
      ] })
    }
  );
}
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: LocationsPage,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const loader$6 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const config = await db.shopConfig.findUnique({ where: { shop } });
  return json({
    planName: (config == null ? void 0 : config.planName) ?? "free",
    senderName: (config == null ? void 0 : config.senderName) ?? "",
    replyToEmail: (config == null ? void 0 : config.replyToEmail) ?? "",
    notifyReadySubject: (config == null ? void 0 : config.notifyReadySubject) ?? "Your order is ready for collection! 🛍️",
    notifyPickedUpSubject: (config == null ? void 0 : config.notifyPickedUpSubject) ?? "Thanks for collecting your order!",
    notifyMerchantEmail: (config == null ? void 0 : config.notifyMerchantEmail) ?? "",
    smtpHost: (config == null ? void 0 : config.smtpHost) ?? "",
    smtpPort: String((config == null ? void 0 : config.smtpPort) ?? 587),
    smtpUser: (config == null ? void 0 : config.smtpUser) ?? "",
    smtpFromEmail: (config == null ? void 0 : config.smtpFromEmail) ?? "",
    smtpFromName: (config == null ? void 0 : config.smtpFromName) ?? "",
    smtpSecure: (config == null ? void 0 : config.smtpSecure) ?? false,
    brandLogoUrl: (config == null ? void 0 : config.brandLogoUrl) ?? "",
    brandPrimaryColor: (config == null ? void 0 : config.brandPrimaryColor) ?? "#1a1a1a",
    brandName: (config == null ? void 0 : config.brandName) ?? ""
  });
};
const action$1 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  await db.shopConfig.update({
    where: { shop },
    data: {
      senderName: form.get("senderName"),
      replyToEmail: form.get("replyToEmail"),
      notifyReadySubject: form.get("notifyReadySubject"),
      notifyPickedUpSubject: form.get("notifyPickedUpSubject"),
      notifyMerchantEmail: form.get("notifyMerchantEmail"),
      smtpHost: form.get("smtpHost"),
      smtpPort: parseInt(form.get("smtpPort")) || 587,
      smtpUser: form.get("smtpUser"),
      smtpPass: form.get("smtpPass") || void 0,
      smtpFromEmail: form.get("smtpFromEmail"),
      smtpFromName: form.get("smtpFromName"),
      smtpSecure: form.get("smtpSecure") === "true",
      brandLogoUrl: form.get("brandLogoUrl") || null,
      brandPrimaryColor: form.get("brandPrimaryColor"),
      brandName: form.get("brandName")
    }
  });
  return json({ ok: true, message: "Settings saved!" });
};
function SettingsPage() {
  var _a2;
  const data = useLoaderData();
  const fetcher = useFetcher();
  const [senderName, setSenderName] = useState(data.senderName);
  const [replyToEmail, setReplyToEmail] = useState(data.replyToEmail);
  const [notifyReadySubject, setNotifyReadySubject] = useState(data.notifyReadySubject);
  const [notifyPickedUpSubject, setNotifyPickedUpSubject] = useState(data.notifyPickedUpSubject);
  const [notifyMerchantEmail, setNotifyMerchantEmail] = useState(data.notifyMerchantEmail);
  const [smtpHost, setSmtpHost] = useState(data.smtpHost);
  const [smtpPort, setSmtpPort] = useState(data.smtpPort);
  const [smtpUser, setSmtpUser] = useState(data.smtpUser);
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFromEmail, setSmtpFromEmail] = useState(data.smtpFromEmail);
  const [smtpFromName, setSmtpFromName] = useState(data.smtpFromName);
  const [brandLogoUrl, setBrandLogoUrl] = useState(data.brandLogoUrl);
  const [brandPrimaryColor, setBrandPrimaryColor] = useState(data.brandPrimaryColor);
  const [brandName, setBrandName] = useState(data.brandName);
  const canUseSmtp = hasSmtp(data.planName);
  const isSubmitting = fetcher.state !== "idle";
  function save() {
    const fd = new FormData();
    fd.set("senderName", senderName);
    fd.set("replyToEmail", replyToEmail);
    fd.set("notifyReadySubject", notifyReadySubject);
    fd.set("notifyPickedUpSubject", notifyPickedUpSubject);
    fd.set("notifyMerchantEmail", notifyMerchantEmail);
    fd.set("smtpHost", smtpHost);
    fd.set("smtpPort", smtpPort);
    fd.set("smtpUser", smtpUser);
    if (smtpPass) fd.set("smtpPass", smtpPass);
    fd.set("smtpFromEmail", smtpFromEmail);
    fd.set("smtpFromName", smtpFromName);
    fd.set("brandLogoUrl", brandLogoUrl);
    fd.set("brandPrimaryColor", brandPrimaryColor);
    fd.set("brandName", brandName);
    fetcher.submit(fd, { method: "POST" });
  }
  return /* @__PURE__ */ jsxs(Page, { title: "Settings", primaryAction: { content: "Save settings", onAction: save, loading: isSubmitting }, children: [
    ((_a2 = fetcher.data) == null ? void 0 : _a2.message) && /* @__PURE__ */ jsx(Box, { paddingBlockEnd: "400", children: /* @__PURE__ */ jsx(Banner, { tone: fetcher.data.ok ? "success" : "critical", children: fetcher.data.message }) }),
    /* @__PURE__ */ jsxs(Layout, { children: [
      /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Email notifications" }),
        /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: "Emails are sent to customers when their order is ready to collect and after pickup." }),
        /* @__PURE__ */ jsxs(InlineGrid, { columns: 2, gap: "400", children: [
          /* @__PURE__ */ jsx(TextField, { label: "Sender name", value: senderName, onChange: setSenderName, autoComplete: "off", placeholder: "Acme Store" }),
          /* @__PURE__ */ jsx(TextField, { label: "Reply-to email", value: replyToEmail, onChange: setReplyToEmail, autoComplete: "off", type: "email", placeholder: "hello@acme.co.nz" })
        ] }),
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "'Ready to collect' subject line",
            value: notifyReadySubject,
            onChange: setNotifyReadySubject,
            autoComplete: "off"
          }
        ),
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "'Picked up' subject line",
            value: notifyPickedUpSubject,
            onChange: setNotifyPickedUpSubject,
            autoComplete: "off"
          }
        ),
        /* @__PURE__ */ jsx(
          TextField,
          {
            label: "BCC merchant email",
            value: notifyMerchantEmail,
            onChange: setNotifyMerchantEmail,
            autoComplete: "off",
            type: "email",
            placeholder: "owner@acme.co.nz",
            helpText: "Receive a copy of every 'Ready to collect' notification."
          }
        )
      ] }) }) }),
      /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        /* @__PURE__ */ jsxs(InlineGrid, { columns: "1fr auto", gap: "400", children: [
          /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Custom SMTP" }),
          !canUseSmtp && /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", children: "Starter plan+" })
        ] }),
        !canUseSmtp ? /* @__PURE__ */ jsx(Banner, { tone: "info", children: "Upgrade to Starter to use your own SMTP server and send emails from your domain." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs(InlineGrid, { columns: 2, gap: "400", children: [
            /* @__PURE__ */ jsx(TextField, { label: "SMTP host", value: smtpHost, onChange: setSmtpHost, autoComplete: "off", placeholder: "smtp.gmail.com", disabled: !canUseSmtp }),
            /* @__PURE__ */ jsx(TextField, { label: "Port", value: smtpPort, onChange: setSmtpPort, autoComplete: "off", type: "number", disabled: !canUseSmtp })
          ] }),
          /* @__PURE__ */ jsxs(InlineGrid, { columns: 2, gap: "400", children: [
            /* @__PURE__ */ jsx(TextField, { label: "SMTP username", value: smtpUser, onChange: setSmtpUser, autoComplete: "off", disabled: !canUseSmtp }),
            /* @__PURE__ */ jsx(TextField, { label: "SMTP password", value: smtpPass, onChange: setSmtpPass, autoComplete: "off", type: "password", placeholder: "Leave blank to keep current", disabled: !canUseSmtp })
          ] }),
          /* @__PURE__ */ jsxs(InlineGrid, { columns: 2, gap: "400", children: [
            /* @__PURE__ */ jsx(TextField, { label: "From email", value: smtpFromEmail, onChange: setSmtpFromEmail, autoComplete: "off", type: "email", disabled: !canUseSmtp }),
            /* @__PURE__ */ jsx(TextField, { label: "From name", value: smtpFromName, onChange: setSmtpFromName, autoComplete: "off", disabled: !canUseSmtp })
          ] })
        ] })
      ] }) }) }),
      /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Email branding" }),
        /* @__PURE__ */ jsx(TextField, { label: "Brand name", value: brandName, onChange: setBrandName, autoComplete: "off", placeholder: "Acme Store" }),
        /* @__PURE__ */ jsx(TextField, { label: "Logo URL", value: brandLogoUrl, onChange: setBrandLogoUrl, autoComplete: "off", placeholder: "https://cdn.shopify.com/...", helpText: "Direct URL to your logo image (max 200px wide)." }),
        /* @__PURE__ */ jsx(TextField, { label: "Brand colour", value: brandPrimaryColor, onChange: setBrandPrimaryColor, autoComplete: "off", placeholder: "#1a1a1a", helpText: "Used in email header background." })
      ] }) }) })
    ] })
  ] });
}
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: SettingsPage,
  loader: loader$6
}, Symbol.toStringTag, { value: "Module" }));
const loader$5 = async ({ request }) => {
  var _a2, _b;
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;
  const config = await db.shopConfig.findUnique({ where: { shop } });
  const planName = (config == null ? void 0 : config.planName) ?? "free";
  const isTest = process.env.SHOPIFY_BILLING_TEST !== "false";
  let activeSubscription = null;
  try {
    const billingCheck = await billing.check({ plans: ["starter", "growth"], isTest });
    if (billingCheck.hasActivePayment) {
      activeSubscription = ((_b = (_a2 = billingCheck.appSubscriptions) == null ? void 0 : _a2[0]) == null ? void 0 : _b.name) ?? null;
    }
  } catch {
  }
  return json({ currentPlan: planName, activeSubscription, plans: PLANS, isTest });
};
const action = async ({ request }) => {
  await authenticate.admin(request);
  return json({ ok: true });
};
const PLAN_FEATURES = {
  free: [
    "1 pickup location",
    "Up to 50 orders / month",
    "'Ready to collect' email notifications",
    "Order management dashboard",
    "Powered by Miko badge"
  ],
  starter: [
    "Up to 3 pickup locations",
    "Up to 500 orders / month",
    "All Free features",
    "Custom SMTP (send from your domain)",
    "No Miko badge"
  ],
  growth: [
    "Unlimited pickup locations",
    "Unlimited orders",
    "All Starter features",
    "Priority support"
  ]
};
function PricingPage() {
  const { currentPlan, plans, isTest } = useLoaderData();
  const shopify2 = useAppBridge();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  async function handleSubscribe(plan) {
    setLoading(plan);
    setError(null);
    try {
      const token = await Promise.race([
        shopify2.idToken(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), 8e3))
      ]);
      const res = await fetch(`/api/billing/subscribe?plan=${plan}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.confirmationUrl) {
        open(data.confirmationUrl, "_top");
      } else {
        setError(data.error ?? "Something went wrong.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }
  return /* @__PURE__ */ jsxs(Page, { title: "Pricing", children: [
    error && /* @__PURE__ */ jsx(Box, { paddingBlockEnd: "400", children: /* @__PURE__ */ jsx(Banner, { tone: "critical", children: error }) }),
    /* @__PURE__ */ jsx(Layout, { children: Object.entries(plans).map(([key, plan]) => {
      const isCurrent = currentPlan === key;
      const features = PLAN_FEATURES[key] ?? [];
      return /* @__PURE__ */ jsx(Layout.Section, { variant: "oneThird", children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
        /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
          /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: plan.name }),
          isCurrent && /* @__PURE__ */ jsx(Badge, { tone: "success", children: "Current plan" })
        ] }),
        /* @__PURE__ */ jsxs(Text, { variant: "heading2xl", as: "p", children: [
          plan.price === 0 ? "Free" : `$${plan.price}`,
          plan.price > 0 && /* @__PURE__ */ jsx(Text, { as: "span", variant: "bodySm", tone: "subdued", children: "/month" })
        ] }),
        isTest && plan.price > 0 && /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", variant: "bodySm", children: "Test mode — no real charge" }),
        /* @__PURE__ */ jsx(Divider, {}),
        /* @__PURE__ */ jsx(BlockStack, { gap: "200", children: features.map((f) => /* @__PURE__ */ jsxs(InlineStack, { gap: "200", align: "start", children: [
          /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(CheckIcon, { width: 16 }) }),
          /* @__PURE__ */ jsx(Text, { as: "p", variant: "bodySm", children: f })
        ] }, f)) }),
        /* @__PURE__ */ jsx(Divider, {}),
        isCurrent ? /* @__PURE__ */ jsx(Button, { disabled: true, fullWidth: true, children: "Current plan" }) : key === "free" ? /* @__PURE__ */ jsx(Button, { fullWidth: true, disabled: true, children: "Downgrade" }) : /* @__PURE__ */ jsx(
          Button,
          {
            variant: "primary",
            fullWidth: true,
            loading: loading === key,
            onClick: () => handleSubscribe(key),
            children: currentPlan === "free" ? "Start 14-day free trial" : `Switch to ${plan.name}`
          }
        )
      ] }) }) }, key);
    }) })
  ] });
}
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: PricingPage,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [config, locationCount, orders] = await Promise.all([
    db.shopConfig.findUnique({ where: { shop } }),
    db.pickupLocation.count({ where: { shop, isActive: true } }),
    db.clickCollectOrder.findMany({
      where: { shop },
      include: { pickupLocation: true },
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);
  const pendingCount = await db.clickCollectOrder.count({ where: { shop, status: "pending" } });
  const readyCount = await db.clickCollectOrder.count({ where: { shop, status: "ready" } });
  const pickedUpCount = await db.clickCollectOrder.count({ where: { shop, status: "picked_up" } });
  const planName = (config == null ? void 0 : config.planName) ?? "free";
  const plan = getPlan(planName);
  const onboardingComplete = locationCount > 0;
  return json({
    planName,
    plan,
    locationCount,
    pendingCount,
    readyCount,
    pickedUpCount,
    onboardingComplete,
    recentOrders: orders.map((o) => ({
      id: o.id,
      orderName: o.shopifyOrderName,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      locationName: o.pickupLocation.name,
      status: o.status,
      createdAt: o.createdAt.toISOString()
    }))
  });
};
const STATUS_BADGE$1 = {
  pending: { tone: "attention", label: "Pending" },
  ready: { tone: "info", label: "Ready" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" }
};
function DashboardPage() {
  const { planName, plan, locationCount, pendingCount, readyCount, pickedUpCount, onboardingComplete, recentOrders } = useLoaderData();
  const navigate = useNavigate();
  return /* @__PURE__ */ jsx(
    Page,
    {
      title: "Miko Click & Collect",
      subtitle: "Manage in-store pickup for your Shopify store",
      primaryAction: pendingCount > 0 ? { content: `View ${pendingCount} pending order${pendingCount !== 1 ? "s" : ""}`, onAction: () => navigate("/app/orders?status=pending") } : { content: "View all orders", onAction: () => navigate("/app/orders") },
      children: /* @__PURE__ */ jsxs(Layout, { children: [
        !onboardingComplete && /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(
          Banner,
          {
            title: "Set up your first pickup location",
            tone: "warning",
            action: { content: "Add location", onAction: () => navigate("/app/locations/new") },
            children: /* @__PURE__ */ jsx("p", { children: "Add at least one pickup location before customers can choose click & collect at checkout." })
          }
        ) }),
        /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsxs(InlineGrid, { columns: { xs: 1, sm: 3 }, gap: "400", children: [
          /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
            /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingSm", as: "h3", tone: "subdued", children: "Pending pickup" }),
              /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(AlertCircleIcon, { width: 20 }) })
            ] }),
            /* @__PURE__ */ jsx(Text, { variant: "heading2xl", as: "p", children: pendingCount }),
            /* @__PURE__ */ jsx(Button, { variant: "plain", onClick: () => navigate("/app/orders?status=pending"), children: "View pending" })
          ] }) }),
          /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
            /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingSm", as: "h3", tone: "subdued", children: "Ready to collect" }),
              /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(CheckCircleIcon, { width: 20 }) })
            ] }),
            /* @__PURE__ */ jsx(Text, { variant: "heading2xl", as: "p", children: readyCount }),
            /* @__PURE__ */ jsx(Button, { variant: "plain", onClick: () => navigate("/app/orders?status=ready"), children: "View ready" })
          ] }) }),
          /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", children: [
            /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
              /* @__PURE__ */ jsx(Text, { variant: "headingSm", as: "h3", tone: "subdued", children: "Collected today" }),
              /* @__PURE__ */ jsx(Box, { children: /* @__PURE__ */ jsx(OrderIcon, { width: 20 }) })
            ] }),
            /* @__PURE__ */ jsx(Text, { variant: "heading2xl", as: "p", children: pickedUpCount }),
            /* @__PURE__ */ jsx(Button, { variant: "plain", onClick: () => navigate("/app/orders?status=picked_up"), children: "View history" })
          ] }) })
        ] }) }),
        /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
          /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", children: [
            /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Recent orders" }),
            /* @__PURE__ */ jsx(Button, { variant: "plain", onClick: () => navigate("/app/orders"), children: "See all" })
          ] }),
          /* @__PURE__ */ jsx(Divider, {}),
          recentOrders.length === 0 ? /* @__PURE__ */ jsx(Box, { padding: "600", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "200", align: "center", children: [
            /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", alignment: "center", children: "No click & collect orders yet." }),
            /* @__PURE__ */ jsx(Text, { as: "p", tone: "subdued", alignment: "center", children: "Once customers choose pickup at checkout, orders appear here." })
          ] }) }) : /* @__PURE__ */ jsx(BlockStack, { gap: "0", children: recentOrders.map((order, idx) => {
            const badge = STATUS_BADGE$1[order.status] ?? { tone: "attention", label: order.status };
            return /* @__PURE__ */ jsxs(Box, { children: [
              idx > 0 && /* @__PURE__ */ jsx(Divider, {}),
              /* @__PURE__ */ jsx(Box, { padding: "300", children: /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", wrap: false, children: [
                /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
                  /* @__PURE__ */ jsxs(InlineStack, { gap: "200", align: "start", children: [
                    /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "span", children: order.orderName }),
                    /* @__PURE__ */ jsx(Badge, { tone: badge.tone, children: badge.label })
                  ] }),
                  /* @__PURE__ */ jsxs(Text, { variant: "bodySm", as: "p", tone: "subdued", children: [
                    order.customerName,
                    " · ",
                    order.locationName
                  ] })
                ] }),
                /* @__PURE__ */ jsx(Button, { variant: "plain", size: "slim", onClick: () => navigate(`/app/orders/${order.id}`), children: "Manage" })
              ] }) })
            ] }, order.id);
          }) })
        ] }) }) }),
        /* @__PURE__ */ jsx(Layout.Section, { variant: "oneThird", children: /* @__PURE__ */ jsxs(BlockStack, { gap: "400", children: [
          /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
            /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Pickup locations" }),
            /* @__PURE__ */ jsxs(Text, { as: "p", tone: "subdued", children: [
              locationCount,
              " active location",
              locationCount !== 1 ? "s" : ""
            ] }),
            /* @__PURE__ */ jsx(Button, { onClick: () => navigate("/app/locations"), children: "Manage locations" })
          ] }) }),
          /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsxs(BlockStack, { gap: "300", children: [
            /* @__PURE__ */ jsx(Text, { variant: "headingMd", as: "h2", children: "Plan" }),
            /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
              /* @__PURE__ */ jsx(Badge, { tone: planName === "free" ? "attention" : "success", children: plan.name }),
              /* @__PURE__ */ jsxs(Text, { as: "span", tone: "subdued", children: [
                "$",
                plan.price,
                "/mo"
              ] })
            ] }),
            /* @__PURE__ */ jsxs(Text, { as: "p", variant: "bodySm", tone: "subdued", children: [
              plan.locationLimit >= 999 ? "Unlimited" : plan.locationLimit,
              " location",
              plan.locationLimit !== 1 ? "s" : ""
            ] }),
            planName === "free" && /* @__PURE__ */ jsx(Button, { onClick: () => navigate("/app/pricing"), children: "Upgrade plan" })
          ] }) })
        ] }) })
      ] })
    }
  );
}
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: DashboardPage,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const loader$3 = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const locationFilter = url.searchParams.get("location") ?? "";
  const whereClause = { shop };
  if (statusFilter !== "all") whereClause.status = statusFilter;
  if (locationFilter) whereClause.pickupLocationId = locationFilter;
  const [orders, locations, counts] = await Promise.all([
    db.clickCollectOrder.findMany({
      where: whereClause,
      include: { pickupLocation: true },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    db.pickupLocation.findMany({ where: { shop, isActive: true }, orderBy: { name: "asc" } }),
    db.clickCollectOrder.groupBy({
      by: ["status"],
      where: { shop },
      _count: true
    })
  ]);
  const countMap = {};
  for (const c of counts) countMap[c.status] = c._count;
  return json({
    orders: orders.map((o) => {
      var _a2, _b, _c;
      return {
        id: o.id,
        orderName: o.shopifyOrderName,
        customerName: o.customerName,
        customerEmail: o.customerEmail,
        locationName: o.pickupLocation.name,
        status: o.status,
        totalPrice: o.totalPrice,
        currency: o.currency,
        expectedReadyAt: ((_a2 = o.expectedReadyAt) == null ? void 0 : _a2.toISOString()) ?? null,
        readyAt: ((_b = o.readyAt) == null ? void 0 : _b.toISOString()) ?? null,
        pickedUpAt: ((_c = o.pickedUpAt) == null ? void 0 : _c.toISOString()) ?? null,
        createdAt: o.createdAt.toISOString()
      };
    }),
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
    countMap,
    statusFilter,
    locationFilter
  });
};
const STATUS_BADGE = {
  pending: { tone: "attention", label: "Pending" },
  ready: { tone: "info", label: "Ready to collect" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" }
};
const TABS = [
  { id: "all", content: "All" },
  { id: "pending", content: "Pending" },
  { id: "ready", content: "Ready" },
  { id: "picked_up", content: "Collected" }
];
function OrdersPage() {
  var _a2;
  const { orders, locations, countMap, statusFilter, locationFilter } = useLoaderData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTabIndex = TABS.findIndex((t) => t.id === statusFilter) ?? 0;
  const safeTabIndex = selectedTabIndex < 0 ? 0 : selectedTabIndex;
  function handleTabChange(idx) {
    const newStatus = TABS[idx].id;
    const params = new URLSearchParams(searchParams);
    if (newStatus === "all") params.delete("status");
    else params.set("status", newStatus);
    setSearchParams(params);
  }
  function handleLocationFilter(value) {
    const params = new URLSearchParams(searchParams);
    if (!value.length || value[0] === "") params.delete("location");
    else params.set("location", value[0]);
    setSearchParams(params);
  }
  const tabsWithCount = TABS.map((t) => ({
    ...t,
    content: t.id === "all" ? `All (${Object.values(countMap).reduce((a, b) => a + b, 0)})` : `${t.content} (${countMap[t.id] ?? 0})`
  }));
  return /* @__PURE__ */ jsx(Page, { title: "Click & Collect Orders", children: /* @__PURE__ */ jsx(Layout, { children: /* @__PURE__ */ jsx(Layout.Section, { children: /* @__PURE__ */ jsxs(Card, { padding: "0", children: [
    /* @__PURE__ */ jsx(Tabs, { tabs: tabsWithCount, selected: safeTabIndex, onSelect: handleTabChange }),
    /* @__PURE__ */ jsx(Box, { padding: "300", children: /* @__PURE__ */ jsx(
      Filters,
      {
        queryValue: "",
        queryPlaceholder: "Search orders...",
        filters: [
          {
            key: "location",
            label: "Location",
            filter: /* @__PURE__ */ jsx(
              ChoiceList,
              {
                title: "Location",
                titleHidden: true,
                choices: [
                  { label: "All locations", value: "" },
                  ...locations.map((l) => ({ label: l.name, value: l.id }))
                ],
                selected: [locationFilter],
                onChange: handleLocationFilter
              }
            ),
            shortcut: true
          }
        ],
        appliedFilters: locationFilter ? [
          {
            key: "location",
            label: `Location: ${((_a2 = locations.find((l) => l.id === locationFilter)) == null ? void 0 : _a2.name) ?? locationFilter}`,
            onRemove: () => handleLocationFilter([""])
          }
        ] : [],
        onQueryChange: () => {
        },
        onQueryClear: () => {
        },
        onClearAll: () => {
          const params = new URLSearchParams(searchParams);
          params.delete("location");
          setSearchParams(params);
        }
      }
    ) }),
    /* @__PURE__ */ jsx(Divider, {}),
    orders.length === 0 ? /* @__PURE__ */ jsx(
      EmptyState,
      {
        heading: "No orders found",
        image: "https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png",
        children: /* @__PURE__ */ jsx("p", { children: "Click & collect orders will appear here once customers choose pickup at checkout." })
      }
    ) : /* @__PURE__ */ jsx(BlockStack, { gap: "0", children: orders.map((order, idx) => {
      const badge = STATUS_BADGE[order.status] ?? { tone: "attention", label: order.status };
      return /* @__PURE__ */ jsxs(Box, { children: [
        idx > 0 && /* @__PURE__ */ jsx(Divider, {}),
        /* @__PURE__ */ jsx(Box, { padding: "400", children: /* @__PURE__ */ jsxs(InlineStack, { align: "space-between", wrap: false, gap: "400", children: [
          /* @__PURE__ */ jsxs(BlockStack, { gap: "100", children: [
            /* @__PURE__ */ jsxs(InlineStack, { gap: "200", children: [
              /* @__PURE__ */ jsx(Text, { variant: "bodyMd", fontWeight: "semibold", as: "span", children: order.orderName }),
              /* @__PURE__ */ jsx(Badge, { tone: badge.tone, children: badge.label })
            ] }),
            /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [
              order.customerName || order.customerEmail,
              " · ",
              order.locationName
            ] }),
            /* @__PURE__ */ jsxs(Text, { variant: "bodySm", tone: "subdued", as: "p", children: [
              format(new Date(order.createdAt), "d MMM yyyy, h:mm a"),
              order.totalPrice ? ` · ${order.currency} ${order.totalPrice}` : ""
            ] })
          ] }),
          /* @__PURE__ */ jsx(Button, { variant: "plain", size: "slim", onClick: () => navigate(`/app/orders/${order.id}`), children: "Manage →" })
        ] }) })
      ] }, order.id);
    }) })
  ] }) }) }) });
}
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: OrdersPage,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const loader$2 = async ({ request }) => {
  await authenticate.admin(request);
  return redirect("/app");
};
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({ request }) => {
  return json({ status: "ok", app: "miko-click-collect" });
};
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const polarisStyles = "/assets/styles-BeiPL2RV.css";
const links = () => [{ rel: "stylesheet", href: polarisStyles }];
const loader = async ({ request }) => {
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};
function App() {
  const { apiKey } = useLoaderData();
  useNavigate();
  useLocation();
  return /* @__PURE__ */ jsxs(AppProvider, { isEmbeddedApp: true, apiKey, children: [
    /* @__PURE__ */ jsxs(NavMenu, { children: [
      /* @__PURE__ */ jsx("a", { href: "/app", rel: "home", children: "Dashboard" }),
      /* @__PURE__ */ jsx("a", { href: "/app/orders", children: "Orders" }),
      /* @__PURE__ */ jsx("a", { href: "/app/locations", children: "Locations" }),
      /* @__PURE__ */ jsx("a", { href: "/app/settings", children: "Settings" }),
      /* @__PURE__ */ jsx("a", { href: "/app/pricing", children: "Pricing" })
    ] }),
    /* @__PURE__ */ jsx(Outlet, {})
  ] });
}
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App,
  links,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-C8SYQDVe.js", "imports": ["/assets/components-BoDeMTOT.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": true, "module": "/assets/root-BLTUZmsR.js", "imports": ["/assets/components-BoDeMTOT.js"], "css": [] }, "routes/webhooks.customers.data_request": { "id": "routes/webhooks.customers.data_request", "parentId": "root", "path": "webhooks/customers/data_request", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.customers.data_request-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.customers.redact": { "id": "routes/webhooks.customers.redact", "parentId": "root", "path": "webhooks/customers/redact", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.customers.redact-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.orders.cancelled": { "id": "routes/webhooks.orders.cancelled", "parentId": "root", "path": "webhooks/orders/cancelled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.cancelled-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.billing.subscribe": { "id": "routes/api.billing.subscribe", "parentId": "root", "path": "api/billing/subscribe", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.billing.subscribe-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/api.public.locations": { "id": "routes/api.public.locations", "parentId": "root", "path": "api/public/locations", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/api.public.locations-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.orders.paid": { "id": "routes/webhooks.orders.paid", "parentId": "root", "path": "webhooks/orders/paid", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.paid-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/webhooks.shop.redact": { "id": "routes/webhooks.shop.redact", "parentId": "root", "path": "webhooks/shop/redact", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/webhooks.shop.redact-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/app.locations.$id": { "id": "routes/app.locations.$id", "parentId": "routes/app.locations", "path": ":id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.locations._id-CA4ZV6bp.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/Banner-DpItam7W.js", "/assets/InlineGrid-hR10Q2YK.js", "/assets/Checkbox-Bp36uC_i.js", "/assets/context-BYLqxjTA.js"], "css": [] }, "routes/app.orders.$id": { "id": "routes/app.orders.$id", "parentId": "routes/app.orders", "path": ":id", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.orders._id-C16TIHkL.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/Banner-DpItam7W.js", "/assets/format-qpevdNMV.js", "/assets/Divider-DzS2gm5F.js", "/assets/context-BYLqxjTA.js", "/assets/context-BO--fIwC.js", "/assets/InlineGrid-hR10Q2YK.js"], "css": [] }, "routes/app.locations": { "id": "routes/app.locations", "parentId": "routes/app", "path": "locations", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.locations-D4lNkv9e.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/Banner-DpItam7W.js", "/assets/EmptyState-B2CIRHA8.js", "/assets/Divider-DzS2gm5F.js", "/assets/context-BYLqxjTA.js"], "css": [] }, "routes/app.settings": { "id": "routes/app.settings", "parentId": "routes/app", "path": "settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.settings-BzRG0izM.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/Banner-DpItam7W.js", "/assets/InlineGrid-hR10Q2YK.js", "/assets/context-BYLqxjTA.js"], "css": [] }, "routes/app.pricing": { "id": "routes/app.pricing", "parentId": "routes/app", "path": "pricing", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.pricing-CeFYEES1.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/Banner-DpItam7W.js", "/assets/Divider-DzS2gm5F.js", "/assets/context-BYLqxjTA.js"], "css": [] }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app._index-B8nNyhjY.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/Banner-DpItam7W.js", "/assets/InlineGrid-hR10Q2YK.js", "/assets/Divider-DzS2gm5F.js", "/assets/context-BYLqxjTA.js"], "css": [] }, "routes/app.orders": { "id": "routes/app.orders", "parentId": "routes/app", "path": "orders", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app.orders-D_q8TCk9.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/Page-C3LF1ZZh.js", "/assets/context-BYLqxjTA.js", "/assets/format-qpevdNMV.js", "/assets/Checkbox-Bp36uC_i.js", "/assets/Divider-DzS2gm5F.js", "/assets/EmptyState-B2CIRHA8.js", "/assets/context-BO--fIwC.js", "/assets/InlineGrid-hR10Q2YK.js"], "css": [] }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_index-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/health": { "id": "routes/health", "parentId": "root", "path": "health", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/health-l0sNRNKZ.js", "imports": [], "css": [] }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/app-jV9AAhc8.js", "imports": ["/assets/components-BoDeMTOT.js", "/assets/context-BYLqxjTA.js", "/assets/context-BO--fIwC.js"], "css": [] } }, "url": "/assets/manifest-1eceaac3.js", "version": "1eceaac3" };
const mode = "production";
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "v3_fetcherPersist": false, "v3_relativeSplatPath": false, "v3_throwAbortReason": false, "v3_routeConfig": false, "v3_singleFetch": false, "v3_lazyRouteDiscovery": false, "unstable_optimizeDeps": false };
const isSpaMode = false;
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.customers.data_request": {
    id: "routes/webhooks.customers.data_request",
    parentId: "root",
    path: "webhooks/customers/data_request",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.customers.redact": {
    id: "routes/webhooks.customers.redact",
    parentId: "root",
    path: "webhooks/customers/redact",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/webhooks.orders.cancelled": {
    id: "routes/webhooks.orders.cancelled",
    parentId: "root",
    path: "webhooks/orders/cancelled",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/api.billing.subscribe": {
    id: "routes/api.billing.subscribe",
    parentId: "root",
    path: "api/billing/subscribe",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/api.public.locations": {
    id: "routes/api.public.locations",
    parentId: "root",
    path: "api/public/locations",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/webhooks.orders.paid": {
    id: "routes/webhooks.orders.paid",
    parentId: "root",
    path: "webhooks/orders/paid",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/webhooks.shop.redact": {
    id: "routes/webhooks.shop.redact",
    parentId: "root",
    path: "webhooks/shop/redact",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/app.locations.$id": {
    id: "routes/app.locations.$id",
    parentId: "routes/app.locations",
    path: ":id",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app.orders.$id": {
    id: "routes/app.orders.$id",
    parentId: "routes/app.orders",
    path: ":id",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/app.locations": {
    id: "routes/app.locations",
    parentId: "routes/app",
    path: "locations",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/app.settings": {
    id: "routes/app.settings",
    parentId: "routes/app",
    path: "settings",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/app.pricing": {
    id: "routes/app.pricing",
    parentId: "routes/app",
    path: "pricing",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route14
  },
  "routes/app.orders": {
    id: "routes/app.orders",
    parentId: "routes/app",
    path: "orders",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route16
  },
  "routes/health": {
    id: "routes/health",
    parentId: "root",
    path: "health",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  mode,
  publicPath,
  routes
};
