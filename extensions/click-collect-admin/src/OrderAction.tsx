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

interface LineItem {
  title: string;
  quantity: number;
  price: string;
  status?: string;
}

interface ClickCollectOrder {
  id: string;
  status: string;
  locationName: string;
  locationAddress: string;
  readyAt: string | null;
  pickedUpAt: string | null;
  useProcessingStep: boolean;
  usePackingStep: boolean;
  lineItems: LineItem[];
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

const NEXT_LABELS: Record<string, string> = {
  processing: "Start Processing",
  packing: "Start Packing",
  ready: "Mark Ready",
  picked_up: "Mark Collected",
};

function getNextStatus(current: string, order: ClickCollectOrder): string | null {
  const s = current;
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

function OrderActionExtension() {
  const { data, close } = useApi(TARGET);
  const [order, setOrder] = useState<ClickCollectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
      const res = await fetch(
        `${APP_URL}/api/admin/order-status?orderGid=${encodeURIComponent(orderGid!)}`,
      );
      if (res.status === 404) {
        setNotClickCollect(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Could not load order details");
        setLoading(false);
        return;
      }
      const json = await res.json();
      setOrder(json.order);
    } catch {
      setError("Could not load order details");
    }
    setLoading(false);
  }

  async function handleAdvanceAll(nextStatus: string) {
    if (!order) return;
    setActionLoading("all");
    setError(null);

    try {
      const res = await fetch(`${APP_URL}/api/admin/order-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, intent: `advance_${nextStatus}` }),
      });
      const json = await res.json();

      if (json.ok) {
        setSuccess(`All items → ${STATUS_LABELS[nextStatus] ?? nextStatus}`);
        await fetchOrder();
      } else {
        setError(json.message || "Action failed");
      }
    } catch {
      setError("Network error, please try again");
    }
    setActionLoading(null);
  }

  async function handleAdvanceItem(itemIndex: number, nextStatus: string, itemTitle: string) {
    if (!order) return;
    setActionLoading(`item-${itemIndex}`);
    setError(null);

    try {
      const res = await fetch(`${APP_URL}/api/admin/order-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, intent: `advance_${nextStatus}`, itemIndex }),
      });
      const json = await res.json();

      if (json.ok) {
        setSuccess(`${itemTitle} → ${STATUS_LABELS[nextStatus] ?? nextStatus}`);
        await fetchOrder();
      } else {
        setError(json.message || "Action failed");
      }
    } catch {
      setError("Network error, please try again");
    }
    setActionLoading(null);
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
        <Banner tone="info">This is not a click &amp; collect order.</Banner>
      </AdminAction>
    );
  }

  const next = order ? getNextStatus(order.status, order) : null;
  const hasMultipleItems = (order?.lineItems.length ?? 0) > 1;

  return (
    <AdminAction
      title="Click & Collect"
      primaryAction={next ? {
        title: hasMultipleItems ? `${NEXT_LABELS[next] ?? "Next step"} (All)` : NEXT_LABELS[next] ?? "Next step",
        onAction: () => handleAdvanceAll(next),
        loading: actionLoading === "all",
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

        {/* Items with per-item controls */}
        {order && order.lineItems.length > 0 && (
          <BlockStack gap="tight">
            <Text fontWeight="bold">Items</Text>
            {order.lineItems.map((item, i) => {
              const itemStatus = item.status ?? order.status;
              const itemNext = hasMultipleItems ? getNextStatus(itemStatus, order) : null;
              return (
                <BlockStack key={i} gap="extraTight">
                  <InlineStack gap="tight" blockAlignment="center">
                    <Text>{item.title}</Text>
                    <Text appearance="subdued">x{item.quantity}</Text>
                  </InlineStack>
                  {hasMultipleItems && (
                    <InlineStack gap="tight" blockAlignment="center">
                      <Badge tone={STATUS_TONES[itemStatus] ?? "warning"}>
                        {STATUS_LABELS[itemStatus] ?? itemStatus}
                      </Badge>
                      {itemNext && (
                        <Button
                          onPress={() => handleAdvanceItem(i, itemNext, item.title)}
                          loading={actionLoading === `item-${i}`}
                        >
                          {NEXT_LABELS[itemNext]}
                        </Button>
                      )}
                    </InlineStack>
                  )}
                  {i < order.lineItems.length - 1 && <Divider />}
                </BlockStack>
              );
            })}
          </BlockStack>
        )}

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
