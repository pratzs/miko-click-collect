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
        app {
          id
        }
      }
    }
  }
`;

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const body = await request.json() as { action: "enable" | "disable" };
  const config = await db.shopConfig.findUnique({ where: { shop } });

  if (body.action === "disable" && config?.deliveryCustomizationId) {
    const res = await admin.graphql(DELETE_MUTATION, {
      variables: { id: config.deliveryCustomizationId },
    });
    const data = await res.json();
    if (!data.data?.deliveryCustomizationDelete?.userErrors?.length) {
      await db.shopConfig.update({
        where: { shop },
        data: { deliveryCustomizationId: "" },
      });
    }
    return json({ ok: true });
  }

  // Find our delivery customization function
  const fnRes = await admin.graphql(FUNCTIONS_QUERY);
  const fnData = await fnRes.json();
  const fn = fnData.data?.shopifyFunctions?.nodes?.find(
    (f: { apiType: string; title: string }) =>
      f.apiType === "delivery_customization" &&
      f.title === "Click and Collect - Hide Shipping"
  );

  if (!fn) {
    return json(
      { ok: false, error: "Delivery customisation function not found. Make sure you have run `shopify app deploy`." },
      { status: 404 }
    );
  }

  // Delete existing one if present
  if (config?.deliveryCustomizationId) {
    await admin.graphql(DELETE_MUTATION, {
      variables: { id: config.deliveryCustomizationId },
    });
  }

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
  const errors = createData.data?.deliveryCustomizationCreate?.userErrors;

  if (errors?.length) {
    return json({ ok: false, error: errors[0].message }, { status: 400 });
  }

  const newId = createData.data?.deliveryCustomizationCreate?.deliveryCustomization?.id;
  if (newId) {
    await db.shopConfig.update({
      where: { shop },
      data: { deliveryCustomizationId: newId },
    });
  }

  return json({ ok: true, id: newId });
};
