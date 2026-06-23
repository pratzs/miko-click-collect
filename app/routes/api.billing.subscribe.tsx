import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const plan = url.searchParams.get("plan") as "starter" | "growth" | null;

  if (!plan || !["starter", "growth"].includes(plan)) {
    return json({ error: "Invalid plan" }, { status: 400 });
  }

  const isTest = process.env.SHOPIFY_BILLING_TEST !== "false";

  try {
    const result = await billing.request({
      plan,
      isTest,
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/pricing?subscribed=${plan}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    // Update plan in DB optimistically
    await db.shopConfig.update({
      where: { shop },
      data: {
        planName: plan,
        trialStartedAt: new Date(),
      },
    });

    return json({ confirmationUrl: result?.confirmationUrl ?? null });
  } catch (e) {
    return json({ error: String(e) }, { status: 500 });
  }
};
