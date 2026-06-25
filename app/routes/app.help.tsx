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
              <Button
                icon={EmailIcon}
                url="mailto:hello@tripsterdevelopers.com?subject=Miko Click and Collect - Support enquiry"
                external
              >
                Contact support
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
