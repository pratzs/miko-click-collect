import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  List,
  Divider,
  Banner,
  Box,
  InlineStack,
  Badge,
  Button,
} from "@shopify/polaris";
import { EmailIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopHandle = session.shop.replace(".myshopify.com", "");
  return json({ shopHandle });
};

export default function HelpPage() {
  const { shopHandle } = useLoaderData<typeof loader>();

  function openSupport() {
    const href = `mailto:hello@tripsterdevelopers.com?subject=${encodeURIComponent("Miko Click and Collect - Support enquiry")}`;
    try {
      const top = window.top || window;
      top.location.href = href;
    } catch {
      window.open(href, "_blank");
    }
  }

  return (
    <Page title="Help and Setup Guide" subtitle="Everything you need to get click and collect up and running">
      <Layout>
        {/* How it works */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">How Click and Collect works</Text>
              <List type="number">
                <List.Item>
                  <Text as="span" fontWeight="semibold">Customer sees the option at checkout</Text> - a "Click and Collect" section
                  appears before the delivery address. They tick the checkbox and choose a pickup location.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Order is placed with pickup details</Text> - the order is automatically tagged
                  "click-collect" in Shopify admin, with the pickup location in the order notes.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">You see it in the app</Text> - the order appears on your dashboard under "Active orders".
                  Prepare the order for collection.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Mark as "Ready"</Text> - click "Mark as Ready to Collect" and the customer receives
                  an email notification with pickup instructions and location details.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Customer collects</Text> - when they arrive, mark the order as "Collected" to complete the flow
                  and fulfil the order in Shopify.
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Checkout setup - Plus */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Text as="h2" variant="headingMd">Setting up the checkout extension</Text>
                <Badge tone="info">Shopify Plus</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Shopify Plus stores can add the Click and Collect block directly in the checkout editor.
              </Text>
              <List type="number">
                <List.Item>
                  Go to <Text as="span" fontWeight="semibold">Settings &gt; Checkout &gt; Customise</Text> in your Shopify admin
                </List.Item>
                <List.Item>
                  Make sure you are on the <Text as="span" fontWeight="semibold">Checkout</Text> page (not Thank You or Order Status)
                </List.Item>
                <List.Item>
                  In the left sidebar, look for the <Text as="span" fontWeight="semibold">Delivery</Text> section
                </List.Item>
                <List.Item>
                  The "Click and Collect - Pickup Selector" should already appear under Delivery. If not, click the Apps icon in the top toolbar and add it
                </List.Item>
                <List.Item>
                  Click <Text as="span" fontWeight="semibold">Save</Text>
                </List.Item>
              </List>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Setting up the Thank You page</Text>
                <Text as="p" tone="subdued">
                  After a click and collect order, customers see a confirmation banner with their pickup location details.
                </Text>
                <List type="number">
                  <List.Item>
                    In the checkout editor, switch the page dropdown from <Text as="span" fontWeight="semibold">Checkout</Text> to <Text as="span" fontWeight="semibold">Thank you</Text>
                  </List.Item>
                  <List.Item>
                    Click <Text as="span" fontWeight="semibold">Add block</Text> in the Main section
                  </List.Item>
                  <List.Item>
                    Find and add "Click and Collect - Pickup Selector" from the Apps list
                  </List.Item>
                  <List.Item>
                    Click <Text as="span" fontWeight="semibold">Save</Text>
                  </List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Theme extension - All plans */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Text as="h2" variant="headingMd">Cart page pickup selector</Text>
                <Badge>All plans</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                For stores on any Shopify plan, you can add a click and collect selector to the cart page using the theme extension.
              </Text>
              <List type="number">
                <List.Item>
                  Go to <Text as="span" fontWeight="semibold">Online Store &gt; Themes &gt; Customise</Text>
                </List.Item>
                <List.Item>
                  Switch the page dropdown to <Text as="span" fontWeight="semibold">Cart</Text>
                </List.Item>
                <List.Item>
                  Click <Text as="span" fontWeight="semibold">Add section</Text> or <Text as="span" fontWeight="semibold">Add block</Text> inside the Cart section
                </List.Item>
                <List.Item>
                  Search for "Click and Collect" under the Apps tab
                </List.Item>
                <List.Item>
                  Add the block and click <Text as="span" fontWeight="semibold">Save</Text>
                </List.Item>
              </List>
              <Banner tone="info">
                The cart page extension saves the customer&apos;s pickup choice as a cart attribute. This works on all Shopify plans.
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Shipping waiver */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Text as="h2" variant="headingMd">Shipping waiver</Text>
                <Badge tone="success">Shopify Plus</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                The shipping waiver hides standard shipping rates at checkout when a customer selects in-store pickup — so they are not prompted to pay for delivery. It requires a one-time setup in both Shopify and the app.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Step 1 — Add a free "Click and Collect" shipping rate in Shopify</Text>
                <Text as="p" tone="subdued">
                  Shopify requires at least one delivery option to be available for physical products. You need to create a $0 rate that the app keeps visible when pickup is selected, while all paid shipping rates are hidden.
                </Text>
                <List type="number">
                  <List.Item>Go to <Text as="span" fontWeight="semibold">Shopify Admin → Settings → Shipping and delivery</Text></List.Item>
                  <List.Item>Under your shipping profile, click <Text as="span" fontWeight="semibold">Add rate</Text></List.Item>
                  <List.Item>Set the rate name to something containing the word <Text as="span" fontWeight="semibold">"Collect"</Text>, <Text as="span" fontWeight="semibold">"Pickup"</Text>, or <Text as="span" fontWeight="semibold">"Local"</Text> — for example: <Text as="span" fontWeight="semibold">Click and Collect — Free</Text></List.Item>
                  <List.Item>Set the price to <Text as="span" fontWeight="semibold">$0.00</Text></List.Item>
                  <List.Item>Click <Text as="span" fontWeight="semibold">Done</Text>, then <Text as="span" fontWeight="semibold">Save</Text></List.Item>
                </List>
                <Banner tone="info">
                  The rate name must contain "Collect", "Pickup", or "Local" so the app knows to keep it visible. All other rates are hidden when the customer selects click and collect.
                </Banner>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Step 2 — Enable the shipping waiver in the app</Text>
                <List type="number">
                  <List.Item>Go to <Text as="span" fontWeight="semibold">Settings</Text> in this app</List.Item>
                  <List.Item>Scroll to the <Text as="span" fontWeight="semibold">Shipping waiver</Text> section</List.Item>
                  <List.Item>Click <Text as="span" fontWeight="semibold">Enable shipping waiver</Text></List.Item>
                  <List.Item>The status indicator turns green when active</List.Item>
                </List>
                <Banner tone="warning">
                  If you re-install the app or change stores, you will need to enable the shipping waiver again — it is linked to your store session.
                </Banner>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">How it works at checkout</Text>
                <Text as="p" tone="subdued">
                  When a customer ticks "I will collect my order in-store":
                </Text>
                <List>
                  <List.Item>All standard paid shipping rates (e.g. Standard — $8.00) are hidden</List.Item>
                  <List.Item>Only the "Click and Collect — Free" rate remains visible</List.Item>
                  <List.Item>If a location has a packing or service fee configured in the app, that fee is added to the product subtotal — not the shipping line</List.Item>
                  <List.Item>The customer sees: subtotal (including any service fee) + $0 shipping = correct total</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Service fees and the shipping waiver</Text>
                <Text as="p" tone="subdued">
                  Service fees (packing fees) are configured per location in the Locations page. They are charged separately from shipping — the fee is distributed across the product prices in the cart. This means:
                </Text>
                <List>
                  <List.Item>The <Text as="span" fontWeight="semibold">"Click and Collect — Free" shipping rate should always be $0</Text> — do not put the service fee amount in the shipping rate price</List.Item>
                  <List.Item>Configure the service fee amount in the location settings in this app instead</List.Item>
                  <List.Item>The app handles distributing the fee correctly across line items</List.Item>
                </List>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Example — Auckland Suburb Store with $6 packing fee:</Text>
                    <Text as="p" variant="bodySm">Product: $48.00 → $54.00 (packing fee added to subtotal)</Text>
                    <Text as="p" variant="bodySm">Shipping: Click and Collect — Free → $0.00</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">Total: $54.00 ✓</Text>
                  </BlockStack>
                </Box>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Troubleshooting</Text>
                <List>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">"Cannot be shipped to selected address" error</Text> — the free "Click and Collect" shipping rate is missing or not named correctly. Check Step 1 above.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Shipping still shows even with pickup selected</Text> — disable and re-enable the shipping waiver in Settings to refresh the connection to the delivery customisation function.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Service fee not appearing in cart total</Text> — make sure the location has a service fee configured in the Locations page and the customer has selected that location at checkout.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Feature not available</Text> — the shipping waiver requires a Shopify Plus store with the checkout extension installed.
                  </List.Item>
                </List>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Email notifications */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Email notifications</Text>
              <Text as="p" tone="subdued">
                The app sends email updates to customers at each stage of their order:
              </Text>
              <List>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Ready to collect</Text> - sent when you mark an order as "Ready". Includes the pickup location address and collection instructions.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Collected confirmation</Text> - sent when you mark an order as "Collected". A simple thank-you email.
                </List.Item>
              </List>
              <Text as="p" tone="subdued">
                To enable email notifications, go to <Text as="span" fontWeight="semibold">Settings</Text> and set up your sender name and reply-to email address.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Customising Shopify&apos;s order confirmation email</Text>
                <Text as="p" tone="subdued">
                  Shopify&apos;s default order confirmation email mentions "shipping". You can customise it to detect click and collect orders:
                </Text>
                <List type="number">
                  <List.Item>
                    Go to <Text as="span" fontWeight="semibold">Settings &gt; Notifications &gt; Order confirmation</Text>
                  </List.Item>
                  <List.Item>Click <Text as="span" fontWeight="semibold">Edit code</Text></List.Item>
                  <List.Item>
                    Add this Liquid condition where the shipping section is:
                  </List.Item>
                </List>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodySm">
                    {`{%- assign is_pickup = false -%}`}<br />
                    {`{%- for attr in attributes -%}`}<br />
                    {`  {%- if attr.first == "miko_pickup_method" and attr.last == "click_and_collect" -%}`}<br />
                    {`    {%- assign is_pickup = true -%}`}<br />
                    {`  {%- endif -%}`}<br />
                    {`{%- endfor -%}`}<br />
                    {`{%- if is_pickup -%}`}<br />
                    {`  <p>Your order will be ready for in-store pickup. We'll email you when it's ready to collect.</p>`}<br />
                    {`{%- else -%}`}<br />
                    {`  <!-- your normal shipping text here -->`}<br />
                    {`{%- endif -%}`}
                  </Text>
                </Box>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Order management */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Managing orders</Text>
              <List>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Identifying click and collect orders in Shopify admin</Text> - orders are automatically
                  tagged with "click-collect" and the pickup location is added to the order notes. You can filter by tag in your Orders page.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Order statuses</Text> - Confirmed (order received) &gt; Processing &gt; Packing &gt; Ready (customer notified) &gt; Collected (order complete).
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Per-item tracking</Text> - for orders with multiple items, you can advance each item individually. For example, mark a phone case as ready while the phone itself is still being processed.
                </List.Item>
                <List.Item>
                  <Text as="span" fontWeight="semibold">Resend notifications</Text> - if a customer hasn&apos;t collected yet, you can resend the "Ready" notification from the order detail page.
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* FAQ */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">FAQ</Text>

              <BlockStack gap="200">
                <Text as="p" fontWeight="semibold">Does this work on non-Plus Shopify plans?</Text>
                <Text as="p" tone="subdued">
                  Yes. The checkout extension requires Shopify Plus. For other plans, use the cart page theme extension - it saves pickup attributes to the cart which flow through to the order.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" fontWeight="semibold">Why does the checkout still show "Ship to"?</Text>
                <Text as="p" tone="subdued">
                  "Ship to" is Shopify&apos;s built-in checkout heading. Checkout UI extensions cannot modify Shopify&apos;s native UI elements. The Click and Collect section appears alongside shipping so customers can choose either option.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" fontWeight="semibold">Can I have multiple pickup locations?</Text>
                <Text as="p" tone="subdued">
                  Yes. Add as many locations as your plan allows. When a customer selects click and collect, they see a dropdown to choose their preferred location. The free plan supports 1 location.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" fontWeight="semibold">How do I know an order is for pickup vs shipping?</Text>
                <Text as="p" tone="subdued">
                  Click and collect orders are tagged "click-collect" in Shopify admin, have the pickup location in the order notes, and appear in the app&apos;s Orders page. Regular shipping orders are not affected.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" fontWeight="semibold">Does the shipping waiver work automatically?</Text>
                <Text as="p" tone="subdued">
                  No — it requires a one-time setup. You must add a free "Click and Collect" shipping rate in Shopify Admin (Settings → Shipping and delivery), then enable the waiver in this app&apos;s Settings page. See the Shipping waiver section above for full instructions.
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="p" fontWeight="semibold">Can I charge a fee for click and collect?</Text>
                <Text as="p" tone="subdued">
                  Yes — configure a service fee per location in the Locations page. Do not put the fee amount in the "Click and Collect" shipping rate; always keep the shipping rate at $0. The app adds the service fee to the cart subtotal automatically.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Contact support */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">Need a hand?</Text>
                <Text as="p" tone="subdued">
                  Our team is based in New Zealand and happy to help with setup or any questions.
                </Text>
              </BlockStack>
              <Button icon={EmailIcon} onClick={openSupport}>
                Contact support
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
