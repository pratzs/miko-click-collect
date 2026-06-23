import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  // Sessions are cleaned up by the session storage
  await db.shopConfig.updateMany({
    where: { shop },
    data: { subscriptionCancelledAt: new Date() },
  });

  return json({ ok: true });
};
