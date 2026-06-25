import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { db } from "./db.server";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  billing: {
    starter: {
      trialDays: 14,
      test: process.env.SHOPIFY_BILLING_TEST !== "false",
      lineItems: [{ amount: 9.95, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
    growth: {
      trialDays: 14,
      test: process.env.SHOPIFY_BILLING_TEST !== "false",
      lineItems: [{ amount: 29.95, currencyCode: "USD", interval: BillingInterval.Every30Days }],
    },
  } as any,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  hooks: {
    afterAuth: async ({ session }) => {
      shopify.registerWebhooks({ session });
      await ensureShopConfig(session.shop, session.accessToken ?? "");
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
