import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { db } from "./db.server";
import { settleDevStoreGrant } from "./dev-store.server";
import { getActiveSubscriptions } from "./utils/billing.server";
import { ensureShopConfig } from "./utils/shop.server";
import { runAutoSetup } from "./utils/auto-setup.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionStorage: new PrismaSessionStorage(db) as any,
  distribution: AppDistribution.AppStore,
  // No `billing` config: this app is on Shopify App Pricing (managed pricing).
  // Plans are defined in the Partner Dashboard, Shopify hosts the
  // plan-selection page, and the Billing API's create path is blocked for this
  // app — so `billing.request()` cannot work and nothing may call it.
  // See app/utils/billing.server.ts.
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ admin, session }) => {
      shopify.registerWebhooks({ session });
      await ensureShopConfig(session.shop, session.accessToken ?? "");

      // Plan state is settled HERE, at install, not in the app loader: Remix
      // runs parent and child loaders in parallel, so a plan written by app.tsx
      // is not visible to the child route rendering the gated screen on that
      // same first render, and the merchant's first ever screen shows the
      // wrong tier.
      try {
        const cfg = await db.shopConfig.findUnique({ where: { shop: session.shop } });
        if (cfg) {
          // A reinstall cancels the old Shopify subscription, so ask Shopify
          // what is actually being billed before trusting the stored plan.
          let hasSubscription = false;
          try {
            hasSubscription = (await getActiveSubscriptions(admin)).length > 0;
          } catch (err) {
            // Permissive: a transient failure must not strip a paying merchant.
            console.warn("[afterAuth] subscription check failed:", err);
            hasSubscription = cfg.planName !== "free";
          }

          const target = await settleDevStoreGrant(admin, session.shop, {
            hasSubscription,
            currentPlan: cfg.planName,
            cachedIsDev: cfg.isDevelopmentStore,
          });
          if (target) {
            await db.shopConfig.update({
              where: { shop: session.shop },
              data: { planName: target },
            });
            console.log(`[afterAuth] ${session.shop}: dev-store grant -> ${target}`);
          }
        }
      } catch (err) {
        console.warn("[afterAuth] plan settle skipped:", err);
      }
      // Fire and forget — never block auth on setup; surfaces errors in the dashboard banner
      runAutoSetup(session.shop, session.accessToken ?? "").catch((err) => {
        console.error("[auto-setup] failed for", session.shop, err);
      });
    },
  },
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
