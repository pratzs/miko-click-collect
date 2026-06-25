import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { runAutoSetup } from "../utils/auto-setup.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const result = await runAutoSetup(session.shop, session.accessToken ?? "");
    return json(result);
  } catch (err) {
    if (err instanceof Response) throw err;
    return json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
};
