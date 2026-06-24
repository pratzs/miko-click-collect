import { useEffect, useState } from "react";
import {
  reactExtension,
  useApi,
  AdminBlock,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Badge,
  Divider,
  ProgressIndicator,
} from "@shopify/ui-extensions-react/admin";

const TARGET = "admin.order-details.block.render";

export default reactExtension(TARGET, () => <OrderBlock />);

const APP_URL = "https://miko-click-collect-production.up.railway.app";

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

const ALL_STEPS = [
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "packing", label: "Packing" },
  { key: "ready", label: "Ready" },
  { key: "picked_up", label: "Collected" },
];

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
  processing: "Start Processing",
  packing: "Start Packing",
  ready: "Mark Ready",
  picked_up: "Mark Collected",
};

function OrderBlock() {
  const { data } = useApi(TARGET);
  const [order, setOrder] = useState<ClickCollectOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "critical"; text: string } | null>(null);

  const orderGid = data?.selected?.[0]?.id ?? null;

  useEffect(() => {
    if (!orderGid) {
      setLoading(false);
      return;
    }
    fetchOrder();
  }, [orderGid]);

  async function fetchOrder() {
    try {
      const url = `${APP_URL}/api/admin/order-status?orderGid=${encodeURIComponent(orderGid!)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setOrder(json.order);
      } else {
        const text = await res.text();
        setMessage({ tone: "critical", text: `API ${res.status}: ${text}` });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage({ tone: "critical", text: `Fetch: ${msg}` });
    }
    setLoading(false);
  }

  async function handleAdvance(nextStatus: string) {
    if (!order) return;
    setActionLoading(true);
    setMessage(null);

    try {
      const res = await fetch(`${APP_URL}/api/admin/order-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id, intent: `advance_${nextStatus}` }),
      });
      const json = await res.json();
      if (json.ok) {
        setMessage({ tone: "success", text: `Updated to: ${STATUS_LABELS[nextStatus] ?? nextStatus}` });
        await fetchOrder();
      } else {
        setMessage({ tone: "critical", text: json.message || "Failed" });
      }
    } catch {
      setMessage({ tone: "critical", text: "Network error" });
    }
    setActionLoading(false);
  }

  if (loading) {
    return (
      <AdminBlock title="Click & Collect">
        <InlineStack inlineAlignment="center">
          <ProgressIndicator size="small-200" />
        </InlineStack>
      </AdminBlock>
    );
  }

  if (!order) return null;

  const steps = ALL_STEPS.filter((s) => {
    if (s.key === "processing" && !order.useProcessingStep) return false;
    if (s.key === "packing" && !order.usePackingStep) return false;
    return true;
  });

  const currentIdx = steps.findIndex(
    (s) => s.key === order.status || (s.key === "confirmed" && order.status === "pending"),
  );

  const next = getNextStatus(order);

  return (
    <AdminBlock title="Click & Collect">
      <BlockStack gap="base">
        {message && <Banner tone={message.tone}>{message.text}</Banner>}

        {/* Status */}
        <InlineStack gap="base" blockAlignment="center">
          <Badge tone={STATUS_TONES[order.status] ?? "warning"}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </InlineStack>

        {/* Progress steps */}
        <InlineStack gap="tight" inlineAlignment="center">
          {steps.map((step, i) => {
            const done = i <= currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <BlockStack key={step.key} gap="extraTight" inlineAlignment="center">
                <Text
                  fontWeight={isCurrent ? "bold" : undefined}
                  appearance={done ? undefined : "subdued"}
                >
                  {done ? "●" : "○"}
                </Text>
                <Text
                  appearance={done ? undefined : "subdued"}
                  fontWeight={isCurrent ? "bold" : undefined}
                >
                  {step.label}
                </Text>
              </BlockStack>
            );
          })}
        </InlineStack>

        <Divider />

        {/* Location */}
        <BlockStack gap="extraTight">
          <Text fontWeight="bold">{order.locationName}</Text>
          {order.locationAddress && <Text appearance="subdued">{order.locationAddress}</Text>}
        </BlockStack>

        {/* Action button */}
        {next && (
          <>
            <Divider />
            <Button
              onPress={() => handleAdvance(next)}
              loading={actionLoading}
            >
              {NEXT_LABELS[next] ?? "Next step"}
            </Button>
          </>
        )}

        {order.status === "picked_up" && order.pickedUpAt && (
          <Text appearance="subdued">
            Collected: {new Date(order.pickedUpAt).toLocaleString()}
          </Text>
        )}
      </BlockStack>
    </AdminBlock>
  );
}
