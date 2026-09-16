import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { DEV_STORE_PLAN } from "../dev-store.server";
import { reconcilePlan } from "../utils/billing.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const config = await db.shopConfig.upsert({
    where: { shop: session.shop },
    create: { shop: session.shop, accessToken: session.accessToken || "" },
    update: { accessToken: session.accessToken || "" },
  });

  // Keep planName in step with what Shopify actually bills. Under Shopify App
  // Pricing the merchant can subscribe, upgrade or cancel entirely on
  // Shopify's hosted page, and we get no webhook for it — reading the live
  // subscription on each app load is how the change reaches us at all.
  // Never throws; falls back to the stored plan.
  await reconcilePlan(admin, session.shop, {
    currentPlan: config.planName,
    isDevelopmentStore: config.isDevelopmentStore,
    devStorePlan: DEV_STORE_PLAN,
  });

  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">Dashboard</Link>
        <Link to="/app/orders">Orders</Link>
        <Link to="/app/locations">Locations</Link>
        <Link to="/app/analytics">Analytics</Link>
        <Link to="/app/settings">Settings</Link>
        <Link to="/app/pricing">Pricing</Link>
        <Link to="/app/help">Help</Link>
      </NavMenu>
      <div style={{ paddingBottom: "3rem" }}>
        <Outlet />
      </div>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  // Suppress the brief 401/302 flash during App Bridge token exchange.
  if (error instanceof Response && (error.status === 401 || error.status === 302)) {
    return null;
  }
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
