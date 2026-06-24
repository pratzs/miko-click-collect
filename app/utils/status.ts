export const STATUS_ORDER = ["confirmed", "processing", "packing", "ready", "picked_up"] as const;
export type OrderStatus = (typeof STATUS_ORDER)[number];

const STATUS_INDEX = Object.fromEntries(STATUS_ORDER.map((s, i) => [s, i])) as Record<string, number>;

export function statusIndex(s: string): number {
  return STATUS_INDEX[s] ?? 0;
}

export function minStatus(statuses: string[]): string {
  if (!statuses.length) return "confirmed";
  return statuses.reduce((min, s) => (statusIndex(s) < statusIndex(min) ? s : min));
}

export interface LineItem {
  title: string;
  quantity: number;
  price: string;
  status?: string;
}

export function parseLineItems(raw: unknown): LineItem[] {
  try {
    const items = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    return items.map((item: Record<string, unknown>) => ({
      title: String(item.title ?? ""),
      quantity: Number(item.quantity ?? 1),
      price: String(item.price ?? "0"),
      status: String(item.status ?? "confirmed"),
    }));
  } catch {
    return [];
  }
}

export function getNextStatus(
  current: string,
  useProcessing: boolean,
  usePacking: boolean,
): string | null {
  if (current === "confirmed" || current === "pending") {
    if (useProcessing) return "processing";
    if (usePacking) return "packing";
    return "ready";
  }
  if (current === "processing") return usePacking ? "packing" : "ready";
  if (current === "packing") return "ready";
  if (current === "ready") return "picked_up";
  return null;
}
