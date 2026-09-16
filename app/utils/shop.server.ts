import { db } from "../db.server";

/**
 * The shop's row, created on first install.
 *
 * Note what this deliberately does NOT do any more: keep its own copy of the
 * access token. It used to, and that copy went stale and started returning
 * "Invalid API key or access token" while the real one in session storage kept
 * working perfectly — because under managed install Shopify rotates the offline
 * token and only the session store is updated. Nothing in the app read the
 * duplicate, so nothing broke, but a dead credential sitting in a table that
 * gets read for other reasons is a trap for the next person and a second copy
 * of a secret for no benefit. The token is passed in for the one call below and
 * not written down.
 */
export async function ensureShopConfig(shop: string, accessToken: string) {
  const existing = await db.shopConfig.findUnique({ where: { shop } });
  if (existing) return existing;

  // Fetch shop name from Shopify
  let shopName = shop;
  try {
    const res = await fetch(`https://${shop}/admin/api/2026-04/shop.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (res.ok) {
      const data = await res.json() as { shop: { name: string } };
      shopName = data.shop?.name || shop;
    }
  } catch {
    // ignore — we'll use the shop domain
  }

  return db.shopConfig.create({
    data: {
      shop,
      shopName,
      brandName: shopName,
      senderName: shopName,
    },
  });
}
