import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { BlockStack, Banner, Button, Page, Spinner, Text } from "@shopify/polaris";
import { useEffect } from "react";
import { authenticate } from "../shopify.server";
import { getPricingPageUrl } from "../utils/billing.server";

// Single pricing surface. Shopify App Pricing hosts the plan-selection page
// (plan comparison, trials, subscribe, upgrade, downgrade, cancel), so this
// route forwards straight there instead of duplicating a pricing table that
// drifts out of sync with what merchants actually see and pay. The dashboard
// still shows the current plan; everything transactional lives on Shopify's
// page.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const pricingUrl = await getPricingPageUrl(admin, session.shop);
  return json({ pricingUrl });
};

export default function Pricing() {
  const { pricingUrl } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  // Top-level redirect: the pricing page lives on admin.shopify.com, outside
  // the embedded app frame. Client-side so it fires reliably on App Bridge
  // in-app navigation from the "Pricing" nav item and upgrade buttons.
  //
  // replace(), not href =: this route only forwards, so it must not stay in
  // history. Otherwise pressing Back from the pricing page lands here and
  // instantly forwards again, and the merchant can never navigate back.
  useEffect(() => {
    if (!pricingUrl) return;
    const target = window.top ?? window;
    target.location.replace(pricingUrl);
  }, [pricingUrl]);

  // A missing app handle means we could not build the plan-selection URL.
  // Say so rather than pushing the merchant to a 404 at the moment they were
  // trying to pay.
  if (!pricingUrl) {
    return (
      <Page title="Plans and pricing" backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}>
        <Banner tone="critical" title="We could not open the plans page">
          <BlockStack gap="200">
            <Text as="p">
              Something went wrong looking up this app in your store. Please refresh and try
              again. If it keeps happening, contact us at hello@tripsterdevelopers.com and we
              will sort it out for you.
            </Text>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </BlockStack>
        </Banner>
      </Page>
    );
  }

  return (
    <Page>
      <BlockStack gap="200" inlineAlign="center">
        <Spinner accessibilityLabel="Opening plans" size="large" />
        <Text as="p" tone="subdued">Opening plans…</Text>
      </BlockStack>
    </Page>
  );
}
