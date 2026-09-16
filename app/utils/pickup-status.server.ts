/**
 * Keeping Shopify and this app telling the same story about one order.
 *
 * They did not. Measured on a live order: this app said "confirmed" while the
 * same order's fulfillment order in Shopify said OPEN / UNFULFILLED, and the
 * Shopify order page still offered its own "Ready for pickup" button. Two
 * systems, two ready states, two different emails, and nothing joining them —
 * so a merchant whose counter staff work in Shopify admin and whose office
 * staff work in this app get different answers about the same customer.
 *
 * That is not a small bug. It is the single most repeated complaint against
 * every app in this category, in merchants' own words: "Our staff keeps finding
 * orders that have been fulfilled in [the app] but don't get updated in
 * Shopify. And we have to keep training them to use [the app] ONLY for in-store
 * pickup orders." An app that quietly becomes a second system of record makes
 * the merchant's job harder, not easier.
 *
 * So this app stops keeping its own private ready state. Shopify's order is the
 * truth, and it is driven from here.
 */

/**
 * Tell Shopify the order is ready to collect.
 *
 * `fulfillmentOrderLineItemsPreparedForPickup` is Shopify's own mechanism: it
 * flips the fulfillment order to ready, which is what the Shopify order page,
 * the mobile admin and POS all read, and it sends Shopify's "Ready for pickup"
 * notification to the customer — merchant-branded, in the customer's language,
 * and already carrying the collection instructions this app writes into the
 * location's pickup settings.
 *
 * It needs `write_merchant_managed_fulfillment_orders`, which this app already
 * has, and — unlike Shopify's own pickup workflow in POS — it does NOT require
 * POS Pro. That is the whole reason this app can offer the counter workflow to
 * a merchant on any plan.
 *
 * Returns what actually happened rather than throwing, because the order IS
 * ready either way; what is at stake is whether the merchant knows Shopify
 * disagrees.
 */
export async function markReadyForPickupInShopify(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  orderGid: string,
): Promise<{ ok: boolean; notified: boolean; problem?: string }> {
  if (!admin || !orderGid) return { ok: false, notified: false, problem: "No Shopify connection." };

  try {
    const foRes = await admin.graphql(
      `#graphql
      query PickupFulfillmentOrders($id: ID!) {
        order(id: $id) {
          fulfillmentOrders(first: 10) {
            nodes {
              id
              status
              deliveryMethod { methodType }
            }
          }
        }
      }`,
      { variables: { id: orderGid } },
    );
    const foData = await foRes.json();
    if (foData?.errors?.length) {
      return {
        ok: false,
        notified: false,
        problem: foData.errors.map((e: { message: string }) => e.message).join("; "),
      };
    }

    const nodes = foData?.data?.order?.fulfillmentOrders?.nodes ?? [];
    const pickups = nodes.filter(
      (n: { status: string; deliveryMethod?: { methodType?: string } }) =>
        n?.deliveryMethod?.methodType === "PICK_UP" &&
        n.status !== "CLOSED" &&
        n.status !== "CANCELLED",
    );

    // Nothing open to mark. Already collected, or cancelled in Shopify. Not a
    // failure — there is simply nothing left to tell Shopify.
    if (pickups.length === 0) return { ok: true, notified: false };

    // Only the fulfillment order id. `PreparedFulfillmentOrderLineItemsInput`
    // has exactly one field, and sending the line items alongside it — the
    // shape fulfillmentCreateV2 wants — is rejected outright: "Field is not
    // defined on PreparedFulfillmentOrderLineItemsInput". The two mutations
    // look alike and are not.
    const byFulfillmentOrder = pickups.map((fo: { id: string }) => ({ fulfillmentOrderId: fo.id }));

    const res = await admin.graphql(
      `#graphql
      mutation ReadyForPickup($input: FulfillmentOrderLineItemsPreparedForPickupInput!) {
        fulfillmentOrderLineItemsPreparedForPickup(input: $input) {
          userErrors { field message }
        }
      }`,
      { variables: { input: { lineItemsByFulfillmentOrder: byFulfillmentOrder } } },
    );
    const data = await res.json();
    if (data?.errors?.length) {
      return {
        ok: false,
        notified: false,
        problem: data.errors.map((e: { message: string }) => e.message).join("; "),
      };
    }
    const userErrors = data?.data?.fulfillmentOrderLineItemsPreparedForPickup?.userErrors ?? [];
    if (userErrors.length) {
      return {
        ok: false,
        notified: false,
        problem: userErrors.map((e: { message: string }) => e.message).join("; "),
      };
    }

    return { ok: true, notified: true };
  } catch (err) {
    console.error("[markReadyForPickupInShopify] failed:", err);
    return {
      ok: false,
      notified: false,
      problem: err instanceof Error ? err.message : String(err),
    };
  }
}
