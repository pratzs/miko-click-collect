/**
 * Shopify App Pricing (managed pricing) for Miko Click and Collect.
 *
 * This app used to create charges itself with the Billing API
 * (`billing.request` / `billing.check` / `billing.cancel`). It is now on
 * Shopify App Pricing: the plans live in the Partner Dashboard, Shopify hosts
 * the plan-selection page, and the Billing API's create path is BLOCKED for
 * this app — `billing.request()` cannot work any more, so every call site was
 * removed rather than left as a fallback that silently 500s.
 *
 * Plan handles configured on the app (must match `PLANS` in ./plans):
 *   free     Free
 *   starter  $9.95/month, 14-day trial
 *   growth   $29.95/month, 14-day trial, "Free for partners and developers" ON
 * plus a private `shopify-test` plan at $0 used for review/testing.
 */
import { db } from "../db.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Structural type, deliberately not the SDK's `AdminApiContext`: all this
 * module needs is "something with .graphql". The SDK's GraphQLClient has a
 * generic, strongly typed `options` parameter, and a narrower structural type
 * here would not be assignable from it (parameter types are contravariant).
 */
type AdminLike = {
  graphql: (query: any, options?: any) => Promise<{ json: () => Promise<any> }>;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type AppSubscription = {
  id: string;
  name: string;
  status: string;
  createdAt?: string;
  currentPeriodEnd?: string | null;
};

// ─── The app handle ─────────────────────────────────────────────────────────

/**
 * Shopify's hosted pricing page is addressed by the app's HANDLE, not its
 * client id, and a wrong handle does not error — it renders a 404 to the
 * merchant at the exact moment they were trying to pay. So the handle is read
 * from Shopify itself (`currentAppInstallation.app.handle`) rather than
 * hardcoded, with an env override for the rare case we need to pin it.
 *
 * Cached per process: the handle is a property of the app, identical for every
 * shop, and only changes if we rename the listing.
 */
let cachedAppHandle: string | null = null;

export async function fetchAppHandle(admin: AdminLike): Promise<string | null> {
  if (process.env.SHOPIFY_APP_HANDLE) return process.env.SHOPIFY_APP_HANDLE;
  if (cachedAppHandle) return cachedAppHandle;

  try {
    const response = await admin.graphql(
      `#graphql
      query AppHandle {
        currentAppInstallation { app { handle } }
      }`,
    );
    // Shopify returns GraphQL errors with HTTP 200, so this is the only place
    // a scope or field problem surfaces at all.
    const data = (await response.json()) as {
      data?: { currentAppInstallation?: { app?: { handle?: string | null } } };
      errors?: unknown;
    };
    if (data?.errors) {
      console.error("[fetchAppHandle] GraphQL errors:", JSON.stringify(data.errors));
      return null;
    }
    const handle = data?.data?.currentAppInstallation?.app?.handle;
    if (!handle) {
      console.error("[fetchAppHandle] no handle in response:", JSON.stringify(data).slice(0, 300));
      return null;
    }
    cachedAppHandle = handle;
    return handle;
  } catch (err) {
    console.error("[fetchAppHandle] lookup failed:", err);
    return null;
  }
}

/**
 * URL of Shopify's hosted plan-selection page for this shop.
 * Returns null when the app handle could not be resolved — callers must show
 * an error instead of sending the merchant to a 404.
 */
export function buildPricingPageUrl(shop: string, appHandle: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, "");
  return `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;
}

export async function getPricingPageUrl(
  admin: AdminLike,
  shop: string,
): Promise<string | null> {
  const handle = await fetchAppHandle(admin);
  return handle ? buildPricingPageUrl(shop, handle) : null;
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

/**
 * Every ACTIVE subscription for this shop, read live from Shopify.
 * Live, not from our DB: a stale `planName` left over from a previous install
 * must never keep paid features unlocked.
 */
export async function getActiveSubscriptions(admin: AdminLike): Promise<AppSubscription[]> {
  const response = await admin.graphql(
    `#graphql
    query ActiveSubscriptions {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          createdAt
          currentPeriodEnd
        }
      }
    }`,
  );
  const data = (await response.json()) as {
    data?: { currentAppInstallation?: { activeSubscriptions?: AppSubscription[] } };
    errors?: unknown;
  };
  if (data?.errors) {
    console.error("[getActiveSubscriptions] GraphQL errors:", JSON.stringify(data.errors));
    throw new Error("Subscription lookup failed");
  }
  return data?.data?.currentAppInstallation?.activeSubscriptions ?? [];
}

/**
 * Maps a Shopify subscription's display name to one of our plan handles.
 *
 * Returns null for a name it doesn't recognise. The caller must treat that as
 * "keep the current DB plan and shout", NEVER as a downgrade: a merchant with
 * an ACTIVE subscription must not lose paid access because a plan was renamed
 * in the Partner Dashboard.
 */
export function getPlanFromSubscriptionName(name: string): string | null {
  const lower = name.toLowerCase();
  if (/\bgrowth\b/.test(lower)) return "growth";
  if (/\bstarter\b/.test(lower)) return "starter";
  if (/\bfree\b/.test(lower)) return "free";
  return null;
}

const PLAN_RANK: Record<string, number> = { free: 0, starter: 1, growth: 2 };

/**
 * Resolves the plan from ALL active subscriptions. Shopify can briefly report
 * more than one during a plan change, so pick the highest tier — a merchant
 * mid-upgrade must never be gated down by subscription ordering.
 * Returns null when no name maps (unknown names: keep DB state).
 */
export function resolvePlanFromSubscriptions(subs: Array<{ name?: string | null }>): string | null {
  const mapped = subs
    .map((s) => getPlanFromSubscriptionName(String(s.name ?? "")))
    .filter((p): p is string => p !== null);
  if (mapped.length === 0) return null;
  return mapped.sort((a, b) => (PLAN_RANK[b] ?? 0) - (PLAN_RANK[a] ?? 0))[0];
}

// No cancel helper here on purpose: under Shopify App Pricing the merchant
// cancels or downgrades on Shopify's own hosted pricing page, and reconcilePlan
// below picks the change up on the next app load.

// ─── Reconciliation ─────────────────────────────────────────────────────────

/**
 * Bring `ShopConfig.planName` in line with what Shopify actually bills, and
 * return the plan now in force.
 *
 * `devStorePlan` is the plan a Partner development store is granted for free
 * (see dev-store.server.ts). Shopify's own "Free for partners and developers"
 * flag only applies once the merchant picks that plan on the hosted page, so a
 * dev store that never visits it still needs this grant.
 *
 * Never throws: on a lookup failure the caller keeps rendering with DB state
 * rather than showing a paying merchant a broken screen.
 */
export async function reconcilePlan(
  admin: AdminLike,
  shop: string,
  opts: { currentPlan: string; isDevelopmentStore: boolean; devStorePlan: string },
): Promise<string> {
  try {
    const subs = await getActiveSubscriptions(admin);

    if (subs.length > 0) {
      const resolved = resolvePlanFromSubscriptions(subs);
      if (resolved === null) {
        console.error(
          `[reconcilePlan] ${shop}: unmapped subscription name(s) ${subs
            .map((s) => s.name)
            .join(", ")} — keeping ${opts.currentPlan}`,
        );
      }
      const plan = resolved ?? opts.currentPlan;
      if (plan !== opts.currentPlan) {
        await db.shopConfig.update({ where: { shop }, data: { planName: plan } });
      }
      return plan;
    }

    // No active subscription. A Partner development store keeps the granted
    // plan; everyone else lapses to free.
    const target = opts.isDevelopmentStore ? opts.devStorePlan : "free";
    if (opts.currentPlan !== target) {
      await db.shopConfig.update({ where: { shop }, data: { planName: target } });
    }
    return target;
  } catch (err) {
    console.error(`[reconcilePlan] ${shop}: failed — keeping DB plan ${opts.currentPlan}:`, err);
    return opts.currentPlan;
  }
}
