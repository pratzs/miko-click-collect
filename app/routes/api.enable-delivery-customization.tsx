import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";

const ENABLE_MUTATION = `#graphql
  mutation deliveryCustomizationCreate($deliveryCustomization: DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization: $deliveryCustomization) {
      deliveryCustomization {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_MUTATION = `#graphql
  mutation deliveryCustomizationDelete($id: ID!) {
    deliveryCustomizationDelete(id: $id) {
      deletedId
      userErrors {
        field
        message
      }
    }
  }
`;

const FUNCTIONS_QUERY = `#graphql
  {
    shopifyFunctions(first: 25) {
      nodes {
        id
        title
        apiType
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  let body: { action?: string } = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const config = await db.shopConfig.findUnique({ where: { shop } });

    if (body.action === "disable") {
      if (config?.deliveryCustomizationId) {
        try {
          await admin.graphql(DELETE_MUTATION, {
            variables: { id: config.deliveryCustomizationId },
          });
        } catch {
          // ignore delete errors - still clear from DB
        }
        await db.shopConfig.update({
          where: { shop },
          data: { deliveryCustomizationId: "" },
        });
      }
      return json({ ok: true });
    }

    // --- Enable flow ---

    // Find our delivery customization function on this store
    const fnRes = await admin.graphql(FUNCTIONS_QUERY);
    const fnData = await fnRes.json();

    const fns = fnData?.data?.shopifyFunctions?.nodes ?? [];
    const fn = fns.find(
      (f: { apiType: string; title: string }) =>
        f.apiType === "delivery_customization" &&
        f.title === "Click and Collect - Hide Shipping"
    );

    if (!fn) {
      return json(
        {
          ok: false,
          error:
            "Function not found on this store. Make sure the app has been deployed with the latest extensions via `shopify app deploy`.",
          found: fns.map((f: { title: string; apiType: string }) => `${f.title} (${f.apiType})`),
        },
        { status: 404 }
      );
    }

    // Delete existing customization if one exists
    if (config?.deliveryCustomizationId) {
      try {
        await admin.graphql(DELETE_MUTATION, {
          variables: { id: config.deliveryCustomizationId },
        });
      } catch {
        // ignore
      }
    }

    // Create the new delivery customization
    const createRes = await admin.graphql(ENABLE_MUTATION, {
      variables: {
        deliveryCustomization: {
          functionId: fn.id,
          title: "Click and Collect - Hide Shipping",
          enabled: true,
        },
      },
    });
    const createData = await createRes.json();
    const errors = createData?.data?.deliveryCustomizationCreate?.userErrors ?? [];

    if (errors.length > 0) {
      return json({ ok: false, error: errors.map((e: { message: string }) => e.message).join("; ") }, { status: 400 });
    }

    const newId = createData?.data?.deliveryCustomizationCreate?.deliveryCustomization?.id;
    if (newId) {
      await db.shopConfig.update({
        where: { shop },
        data: { deliveryCustomizationId: newId },
      });
    }

    return json({ ok: true, id: newId });
  } catch (err) {
    // If authenticate.admin throws a redirect Response (re-auth), rethrow it
    if (err instanceof Response) throw err;
    console.error("[delivery-customization] error:", err);
    return json(
      { ok: false, error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
};
