import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { runAutoSetup } from "../utils/auto-setup.server";

/**
 * Self-healing: if the merchant deletes our auto-created "Click and Collect
 * Service Fee" product from Shopify Admin, this webhook re-creates it so
 * checkout keeps working. No "Re-run setup" click required.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, session } = await authenticate.webhook(request);
  const deletedId = String((payload as { id?: string | number })?.id ?? "");
  if (!deletedId) return new Response();

  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config) return new Response();

  const deletedGid = `gid://shopify/Product/${deletedId}`;
  if (config.serviceFeeProductId === deletedGid) {
    // Clear stale IDs so the next setup run creates a fresh product
    await db.shopConfig.update({
      where: { shop },
      data: { serviceFeeProductId: "", serviceFeeVariantId: "" },
    });

    if (session?.accessToken) {
      runAutoSetup(shop, session.accessToken).catch((err) =>
        console.error("[webhook products/delete] re-setup failed", err),
      );
    }
  }

  return new Response();
};
