import { db } from "../db.server";

export async function ensureShopConfig(shop: string, accessToken: string) {
  const existing = await db.shopConfig.findUnique({ where: { shop } });
  if (existing) {
    await db.shopConfig.update({
      where: { shop },
      data: { accessToken },
    });
    return existing;
  }

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
      accessToken,
      shopName,
      brandName: shopName,
      senderName: shopName,
    },
  });
}
