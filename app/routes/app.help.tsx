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
                <Badge tone="success">All plans</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Works on every Shopify plan (Basic, Shopify, Advanced, Plus) with the new Shopify Checkout. Add the Click and Collect block directly in the checkout editor — this is the primary way customers will see the pickup option.
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

        {/* Theme extension - Optional */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Text as="h2" variant="headingMd">Cart page pickup selector</Text>
                <Badge tone="attention">Optional</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Lets customers choose pickup BEFORE they hit checkout — useful if you want to surface the option earlier in the funnel. The checkout extension above already covers the pickup flow on its own; this is purely an upgrade for the cart-page experience.
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
                The cart page block is optional — the checkout extension already provides the pickup flow on its own. Use this only if you want customers to see the pickup option on the cart page too.
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Shipping waiver & service fees */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Text as="h2" variant="headingMd">Shipping waiver and service fees</Text>
                <Badge tone="success">Auto-configured</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                When you installed the app, three things were created in your Shopify store automatically. You do not need to set anything up — this section is here so you understand what is happening.
              </Text>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">What gets auto-created in your Shopify store</Text>
                <List>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">A hidden "Click and Collect Service Fee" product</Text> — used as a cart line item when the customer chooses a paid pickup location. This is what gives the order summary a clearly labelled fee line instead of a generic "Shipping $X.XX".
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">One $0 shipping rate per pickup location</Text>, named "Click and Collect - {"{Location Name}"}". Acts as the delivery option Shopify needs; the actual fee is charged on the cart line above.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">A delivery customisation</Text> that hides every paid shipping rate when a customer selects in-store pickup, and shows ONLY the rate for the location they selected.
                  </List.Item>
                </List>
                <Banner tone="info">
                  Everything is rebuilt automatically every time you add, edit, or delete a pickup location. If anything looks wrong, click "Re-run setup" in Settings.
                </Banner>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">How it works at checkout</Text>
                <Text as="p" tone="subdued">When a customer ticks "I will collect my order in-store" and chooses a pickup location:</Text>
                <List>
                  <List.Item>All paid shipping rates (e.g. Standard — $8.00) are hidden</List.Item>
                  <List.Item>Only the rate for the selected location is shown — "Click and Collect - {"{Location Name}"}" with the configured fee (or $0)</List.Item>
                </List>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm" fontWeight="semibold">Example — Customer chooses Auckland Suburb Store ($6 packing fee):</Text>
                    <Text as="p" variant="bodySm">Product: $48.00</Text>
                    <Text as="p" variant="bodySm">Subtotal: $48.00</Text>
                    <Text as="p" variant="bodySm">Shipping: Click and Collect - Auckland Suburb Store → $6.00</Text>
                    <Text as="p" variant="bodySm" fontWeight="semibold">Total: $54.00 ✓</Text>
                  </BlockStack>
                </Box>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Setting service fees per location</Text>
                <List type="number">
                  <List.Item>Go to <Text as="span" fontWeight="semibold">Locations</Text> in this app</List.Item>
                  <List.Item>Edit a location and set <Text as="span" fontWeight="semibold">Service fee type</Text> to "Fixed" and enter the fee amount</List.Item>
                  <List.Item>Save — the app automatically updates that location's shipping rate in Shopify to the new amount. The fee shows up as the shipping cost at checkout.</List.Item>
                </List>
              </BlockStack>

              <Divider />

              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Troubleshooting</Text>
                <List>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">Something is not showing at checkout</Text> — go to Settings, click <Text as="span" fontWeight="semibold">Re-run setup</Text>, then refresh checkout.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">I have multiple shipping profiles</Text> — auto-setup adds rates to your default profile only. For product-specific profiles, manually add a rate named "Click and Collect - {"{Location Name}"}" to each profile that should support pickup.
                  </List.Item>
                  <List.Item>
                    <Text as="span" fontWeight="semibold">I deleted a Click and Collect shipping rate by mistake</Text> — click "Re-run setup" in Settings and the missing rates will be recreated.
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

              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">Customise Shopify&apos;s order confirmation email for pickup orders</Text>
                <Text as="p" tone="subdued">
                  Optional, but recommended. By default Shopify&apos;s order confirmation email shows a generic shipping message and lists our internal service fee line. The three find-and-replace edits below give pickup customers a clear, pickup-specific email.
                </Text>
                <Banner tone="info">
                  Go to <Text as="span" fontWeight="semibold">Settings → Notifications → Order confirmation → Edit code</Text> and apply the three edits below in order. Click <Text as="span" fontWeight="semibold">Save</Text> when done.
                </Banner>

                <Divider />

                {/* Edit 1 */}
                <Text as="p" fontWeight="semibold">Edit 1 — Add pickup detection at the very top of the email body</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Paste this at the very top of the email template (before the first <Text as="span" fontWeight="semibold">{`<html>`}</Text> or visible content). This reads our cart attributes once and stores them as variables you can use below.
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodySm">
                    {`{%- assign is_pickup = false -%}`}<br />
                    {`{%- assign pickup_location = "" -%}`}<br />
                    {`{%- for attr in attributes -%}`}<br />
                    {`  {%- if attr.first == "miko_pickup_method" and attr.last == "click_and_collect" -%}{%- assign is_pickup = true -%}{%- endif -%}`}<br />
                    {`  {%- if attr.first == "miko_location_name" -%}{%- assign pickup_location = attr.last -%}{%- endif -%}`}<br />
                    {`{%- endfor -%}`}
                  </Text>
                </Box>

                <Divider />

                {/* Edit 2 */}
                <Text as="p" fontWeight="semibold">Edit 2 — Hide the service fee line from the items table</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Find</Text> this line:
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodySm">{`{% for line in subtotal_line_items %}`}</Text>
                </Box>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Replace with</Text> (adds a skip-this-line guard immediately after the loop opens):
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodySm">
                    {`{% for line in subtotal_line_items %}`}<br />
                    {`  {%- if line.title contains "Click and Collect Service Fee" -%}{% continue %}{%- endif -%}`}
                  </Text>
                </Box>

                <Divider />

                {/* Edit 3 */}
                <Text as="p" fontWeight="semibold">Edit 3 — Show pickup instructions instead of the shipping message</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Find</Text> this line:
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodySm">{`{% if requires_shipping %}`}</Text>
                </Box>
                <Text as="p" tone="subdued" variant="bodySm">
                  <Text as="span" fontWeight="semibold">Replace with</Text> (inserts a pickup-specific branch before the existing shipping branch):
                </Text>
                <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                  <Text as="p" variant="bodySm">
                    {`{% if is_pickup %}`}<br />
                    {`  <p>Your order will be ready for collection at <strong>{{ pickup_location }}</strong>. We'll email you again when it's ready.</p>`}<br />
                    {`{% elsif requires_shipping %}`}
                  </Text>
                </Box>

                <Divider />

                <Banner tone="success">
                  Click <Text as="span" fontWeight="semibold">Save</Text>. Pickup orders will now show the location name and a clear collection message; regular shipping orders are unchanged. The service fee line is gone from the items table; totals still reflect the fee.
                </Banner>
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
                  Yes — every part of this app works on Basic, Shopify, Advanced, and Plus. Shopify opened checkout extensibility, delivery customisation functions, and theme app extensions to all plans when they migrated to the new Shopify Checkout. The only requirement is that your store is on the new Shopify Checkout (default for new stores).
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
