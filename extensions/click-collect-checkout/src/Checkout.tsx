import {
  reactExtension,
  Banner,
  Text,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension("purchase.checkout.contact.render-after", () => (
  <Banner title="Click & Collect" status="info">
    <Text>Miko Click & Collect extension is active. Full UI coming soon.</Text>
  </Banner>
));
