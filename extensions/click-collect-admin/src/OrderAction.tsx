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
  status: string;
  locationName: string;
  locationAddress: string;
  readyAt: string | null;
  pickedUpAt: string | null;
  useProcessingStep: boolean;
  usePackingStep: boolean;
}

const APP_URL = "https://miko-click-collect-production.up.railway.app";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Confirmed",
  processing: "Processing",
  packing: "Packing",
  ready: "Ready to collect",
  picked_up: "Collected",
};

const STATUS_TONES: Record<string, "warning" | "info" | "success" | "critical"> = {
  confirmed: "warning",
  pending: "warning",
  processing: "warning",
  packing: "info",
  ready: "info",
  picked_up: "success",
};

function getNextStatus(order: ClickCollectOrder): string | null {
  const s = order.status;
  if (s === "confirmed" || s === "pending") {
    if (order.useProcessingStep) return "processing";
    if (order.usePackingStep) return "packing";
    return "ready";
  }
  if (s === "processing") return order.usePackingStep ? "packing" : "ready";
  if (s === "packing") return "ready";
  if (s === "ready") return "picked_up";
  return null;
}

const NEXT_LABELS: Record<string, string> = {
  processing: "Mark as Processing",
  packing: "Mark as Packing",
  ready: "Mark as Ready",
  picked_up: "Mark as Collected",
};

function OrderActionExtension() {
  const { data, close } = useApi(TARGET);
  const [order, setOrder] = useState<ClickCollectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notClickCollect, setNotClickCollect] = useState(false);

  const orderGid = data?.selected?.[0]?.id ?? null;

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
      const url = `${APP_URL}/api/admin/order-status?orderGid=${encodeURIComponent(orderGid!)}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setNotClickCollect(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const text = await res.text();
        setError(`API error ${res.status}: ${text}`);
        setLoading(false);
        return;
      }
      const json = await res.json();
      if (!json.order) {
        setError(`No order in response: ${JSON.stringify(json)}`);
        setLoading(false);
        return;
      }
      setOrder(json.order);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Fetch failed: ${msg}`);
    }
    setLoading(false);
  }

  async function handleAction(nextStatus: string) {
    if (!order) return;
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${APP_URL}/api/admin/order-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, intent: `advance_${nextStatus}` }),
      });
      const json = await res.json();

      if (json.ok) {
        setSuccess(
          nextStatus === "picked_up"
            ? "Order collected and fulfilled"
            : `Order status updated to: ${STATUS_LABELS[nextStatus] ?? nextStatus}`
        );
        await fetchOrder();
      } else {
        setError(json.message || "Action failed");
      }
    } catch {
      setError("Network error, please try again");
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <AdminAction title="Click & Collect" primaryAction={null} secondaryAction={{ title: "Close", onAction: close }}>
        <BlockStack gap="base">
          <InlineStack inlineAlignment="center">
            <ProgressIndicator size="small-200" />
          </InlineStack>
          <Text>Loading...</Text>
        </BlockStack>
      </AdminAction>
    );
  }

  if (notClickCollect) {
    return (
      <AdminAction title="Click & Collect" primaryAction={null} secondaryAction={{ title: "Close", onAction: close }}>
        <Banner tone="info">This is not a click & collect order.</Banner>
      </AdminAction>
    );
  }

  const next = order ? getNextStatus(order) : null;

  return (
    <AdminAction
      title="Click & Collect"
      primaryAction={next ? {
        title: NEXT_LABELS[next] ?? "Next step",
        onAction: () => handleAction(next),
        loading: actionLoading,
      } : null}
      secondaryAction={{ title: "Close", onAction: close }}
    >
      <BlockStack gap="base">
        {success && <Banner tone="success">{success}</Banner>}
        {error && <Banner tone="critical">{error}</Banner>}

        <InlineStack gap="base" blockAlignment="center">
          <Text fontWeight="bold">Status:</Text>
          <Badge tone={STATUS_TONES[order?.status ?? ""] ?? "warning"}>
            {STATUS_LABELS[order?.status ?? ""] ?? order?.status}
          </Badge>
        </InlineStack>

        <Divider />

        <BlockStack gap="extraTight">
          <Text fontWeight="bold">Pickup location</Text>
          <Text>{order?.locationName}</Text>
          {order?.locationAddress && <Text appearance="subdued">{order.locationAddress}</Text>}
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
