import { useEffect, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminAction,
  BlockStack,
  Text,
  Button,
  Banner,
  InlineStack,
  Badge,
  Divider,
  ProgressIndicator,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.action.render";

export default reactExtension(TARGET, () => <OrderActionExtension />);

interface ClickCollectOrder {
  id: string;
  status: "pending" | "ready" | "picked_up" | "cancelled";
  locationName: string;
  locationAddress: string;
  readyAt: string | null;
  pickedUpAt: string | null;
}

function OrderActionExtension() {
  const { data, close } = useApi(TARGET);
  const [order, setOrder] = useState<ClickCollectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notClickCollect, setNotClickCollect] = useState(false);

  const orderId = data?.selected?.[0]?.id;
  const orderGid = orderId ? `gid://shopify/Order/${orderId}` : null;

  const APP_URL = "https://miko-click-collect-production.up.railway.app";

  useEffect(() => {
    if (!orderGid) {
      setLoading(false);
      setNotClickCollect(true);
      return;
    }
    fetchOrder();
  }, [orderGid]);

  async function fetchOrder() {
    try {
      const res = await fetch(
        `${APP_URL}/api/admin/order-status?orderGid=${encodeURIComponent(orderGid!)}`,
        { method: "GET", headers: { "Content-Type": "application/json" } }
      );
      if (res.status === 404) {
        setNotClickCollect(true);
        setLoading(false);
        return;
      }
      const json = await res.json();
      setOrder(json.order);
    } catch (e) {
      setError("Could not load order details");
    }
    setLoading(false);
  }

  async function handleAction(intent: "mark_ready" | "mark_picked_up") {
    if (!order) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${APP_URL}/api/admin/order-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, intent }),
      });
      const json = await res.json();

      if (json.ok) {
        setSuccess(
          intent === "mark_ready"
            ? `Order marked as ready${json.emailSent ? " - notification sent to customer" : ""}`
            : "Order marked as collected"
        );
        await fetchOrder();
      } else {
        setError(json.message || "Action failed");
      }
    } catch (e) {
      setError("Network error, please try again");
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <AdminAction title="Click & Collect" primaryAction={null} secondaryAction={{ title: "Close", onAction: close }}>
        <BlockStack gap="base">
          <InlineStack inlineAlignment="center" blockAlignment="center">
            <ProgressIndicator size="small-200" />
          </InlineStack>
          <Text>Loading order details...</Text>
        </BlockStack>
      </AdminAction>
    );
  }

  if (notClickCollect) {
    return (
      <AdminAction title="Click & Collect" primaryAction={null} secondaryAction={{ title: "Close", onAction: close }}>
        <BlockStack gap="base">
          <Banner tone="info">This order is not a click & collect order.</Banner>
        </BlockStack>
      </AdminAction>
    );
  }

  const statusLabel =
    order?.status === "pending"
      ? "Pending"
      : order?.status === "ready"
        ? "Ready to collect"
        : order?.status === "picked_up"
          ? "Collected"
          : order?.status ?? "Unknown";

  const statusTone =
    order?.status === "pending"
      ? "warning"
      : order?.status === "ready"
        ? "info"
        : order?.status === "picked_up"
          ? "success"
          : "warning";

  const primaryAction =
    order?.status === "pending"
      ? {
          title: "Mark as Ready",
          onAction: () => handleAction("mark_ready"),
          loading: actionLoading,
        }
      : order?.status === "ready"
        ? {
            title: "Mark as Picked Up",
            onAction: () => handleAction("mark_picked_up"),
            loading: actionLoading,
          }
        : null;

  return (
    <AdminAction
      title="Click & Collect"
      primaryAction={primaryAction}
      secondaryAction={{ title: "Close", onAction: close }}
    >
      <BlockStack gap="base">
        {success && <Banner tone="success">{success}</Banner>}
        {error && <Banner tone="critical">{error}</Banner>}

        <InlineStack gap="base" blockAlignment="center">
          <Text fontWeight="bold">Status:</Text>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </InlineStack>

        <Divider />

        <BlockStack gap="extraTight">
          <Text fontWeight="bold">Pickup location</Text>
          <Text>{order?.locationName}</Text>
          {order?.locationAddress && (
            <Text appearance="subdued">{order.locationAddress}</Text>
          )}
        </BlockStack>

        {order?.status === "picked_up" && order.pickedUpAt && (
          <>
            <Divider />
            <Text appearance="subdued">
              Collected: {new Date(order.pickedUpAt).toLocaleString()}
            </Text>
          </>
        )}
      </BlockStack>
    </AdminAction>
  );
}
