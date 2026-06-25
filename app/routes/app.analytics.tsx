import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Badge,
  Divider,
  Box,
  Banner,
  Select,
  ProgressBar,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { getPlan } from "../utils/plans";

function diffMinutes(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await db.shopConfig.findUnique({ where: { shop } });
  const planName = config?.planName ?? "free";

  if (planName === "free" || planName === "starter") {
    return json({ allowed: false as const, planName });
  }

  const url = new URL(request.url);
  const range = url.searchParams.get("range") ?? "30";
  const days = parseInt(range, 10) || 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const orders = await db.clickCollectOrder.findMany({
    where: { shop, createdAt: { gte: since } },
    include: { pickupLocation: true },
    orderBy: { createdAt: "asc" },
  });

  const allOrders = await db.clickCollectOrder.findMany({
    where: { shop },
    select: { id: true },
  });

  // ---- Core metrics ----
  const totalOrders = orders.length;
  const collectedOrders = orders.filter((o) => o.status === "picked_up");
  const readyOrders = orders.filter((o) => o.status === "ready");
  const activeOrders = orders.filter((o) =>
    ["confirmed", "processing", "packing", "ready"].includes(o.status),
  );
  const collectionRate = totalOrders > 0 ? Math.round((collectedOrders.length / totalOrders) * 100) : 0;

  // ---- Timing metrics ----
  const confirmToReadyTimes: number[] = [];
  const readyToCollectedTimes: number[] = [];
  const totalTurnTimes: number[] = [];

  for (const o of orders) {
    if (o.confirmedAt && o.readyAt) {
      confirmToReadyTimes.push(diffMinutes(o.confirmedAt, o.readyAt));
    }
    if (o.readyAt && o.pickedUpAt) {
      readyToCollectedTimes.push(diffMinutes(o.readyAt, o.pickedUpAt));
    }
    if (o.confirmedAt && o.pickedUpAt) {
      totalTurnTimes.push(diffMinutes(o.confirmedAt, o.pickedUpAt));
    }
  }

  const avg = (arr: number[]) => (arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0);

  const avgPrepTime = avg(confirmToReadyTimes);
  const avgPickupWait = avg(readyToCollectedTimes);
  const avgTotalTurn = avg(totalTurnTimes);

  // ---- Orders by location ----
  const locationMap = new Map<string, { name: string; total: number; collected: number; active: number }>();
  for (const o of orders) {
    const loc = locationMap.get(o.pickupLocationId) ?? {
      name: o.pickupLocation.name,
      total: 0,
      collected: 0,
      active: 0,
    };
    loc.total++;
    if (o.status === "picked_up") loc.collected++;
    if (["confirmed", "processing", "packing", "ready"].includes(o.status)) loc.active++;
    locationMap.set(o.pickupLocationId, loc);
  }
  const locationStats = Array.from(locationMap.values()).sort((a, b) => b.total - a.total);

  // ---- Orders by day ----
  const dayMap = new Map<string, number>();
  for (const o of orders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }

  const dailyOrders: Array<{ date: string; count: number }> = [];
  const cursor = new Date(since);
  const now = new Date();
  while (cursor <= now) {
    const key = cursor.toISOString().slice(0, 10);
    dailyOrders.push({ date: key, count: dayMap.get(key) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const peakDay = dailyOrders.reduce((max, d) => (d.count > max.count ? d : max), { date: "", count: 0 });

  // ---- Orders by day of week ----
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowCounts = Array(7).fill(0) as number[];
  for (const o of orders) {
    dowCounts[o.createdAt.getDay()]++;
  }
  const busiestDow = dowCounts.indexOf(Math.max(...dowCounts));

  // ---- Status breakdown ----
  const statusCounts: Record<string, number> = {};
  for (const o of orders) {
    statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
  }

  // ---- Revenue ----
  let totalRevenue = 0;
  let totalServiceFees = 0;
  for (const o of orders) {
    const price = parseFloat(o.totalPrice);
    if (!isNaN(price)) totalRevenue += price;
    const fee = parseFloat(o.serviceFee);
    if (!isNaN(fee) && fee > 0) totalServiceFees += fee;
  }

  const currency = config?.currency ?? "NZD";

  return json({
    allowed: true as const,
    planName,
    range: days,
    stats: {
      totalOrders,
      totalAllTime: allOrders.length,
      collectedCount: collectedOrders.length,
      activeCount: activeOrders.length,
      readyCount: readyOrders.length,
      collectionRate,
      avgPrepTime,
      avgPickupWait,
      avgTotalTurn,
      totalRevenue: totalRevenue.toFixed(2),
      totalServiceFees: totalServiceFees.toFixed(2),
      currency,
      peakDay: peakDay.count > 0 ? peakDay : null,
      busiestDow: DOW[busiestDow],
      busiestDowCount: dowCounts[busiestDow],
    },
    locationStats,
    dailyOrders,
    statusCounts,
    dowCounts: DOW.map((day, i) => ({ day, count: dowCounts[i] })),
  });
};

function MetricCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" tone="subdued" variant="bodySm">{label}</Text>
        <Text as="p" variant="headingXl">{value}</Text>
        {sublabel && <Text as="p" tone="subdued" variant="bodySm">{sublabel}</Text>}
      </BlockStack>
    </Card>
  );
}

const STATUS_LABELS: Record<string, { label: string; tone: "attention" | "warning" | "info" | "success" | "critical" }> = {
  confirmed: { label: "Confirmed", tone: "attention" },
  processing: { label: "Processing", tone: "warning" },
  packing: { label: "Packing", tone: "info" },
  ready: { label: "Ready", tone: "info" },
  picked_up: { label: "Collected", tone: "success" },
  cancelled: { label: "Cancelled", tone: "critical" },
};

export default function AnalyticsPage() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (!data.allowed) {
    return (
      <Page
        title="Analytics"
        backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      >
        <Banner tone="warning">
          Analytics is available on the Growth plan. <a href="/app/pricing">View plans</a>
        </Banner>
      </Page>
    );
  }

  const { stats, locationStats, dailyOrders, statusCounts, dowCounts, range } = data;
  const maxDaily = Math.max(...dailyOrders.map((d) => d.count), 1);
  const maxDow = Math.max(...dowCounts.map((d) => d.count), 1);

  return (
    <Page
      title="Analytics"
      subtitle={`Last ${range} days`}
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      secondaryActions={[
        {
          content: range === 7 ? "Last 7 days" : range === 30 ? "Last 30 days" : `Last ${range} days`,
          onAction: () => {},
        },
      ]}
    >
      <BlockStack gap="600">
        {/* Range selector */}
        <InlineStack gap="200">
          {[7, 14, 30, 90].map((d) => (
            <div
              key={d}
              onClick={() => navigate(`/app/analytics?range=${d}`)}
              style={{
                padding: "6px 14px",
                borderRadius: "8px",
                cursor: "pointer",
                background: range === d ? "var(--p-color-bg-fill-brand)" : "var(--p-color-bg-surface)",
                color: range === d ? "white" : "inherit",
                border: range === d ? "none" : "1px solid var(--p-color-border)",
                fontSize: "13px",
                fontWeight: range === d ? 600 : 400,
              }}
            >
              {d === 7 ? "7 days" : d === 14 ? "14 days" : d === 30 ? "30 days" : "90 days"}
            </div>
          ))}
        </InlineStack>

        {/* Key metrics */}
        <InlineGrid columns={4} gap="400">
          <MetricCard
            label="Total orders"
            value={stats.totalOrders}
            sublabel={`${stats.totalAllTime} all time`}
          />
          <MetricCard
            label="Collected"
            value={stats.collectedCount}
            sublabel={`${stats.collectionRate}% collection rate`}
          />
          <MetricCard
            label="Currently active"
            value={stats.activeCount}
            sublabel={`${stats.readyCount} ready for pickup`}
          />
          <MetricCard
            label="Click and collect revenue"
            value={`${stats.currency} ${stats.totalRevenue}`}
            sublabel={parseFloat(stats.totalServiceFees) > 0 ? `${stats.currency} ${stats.totalServiceFees} in service fees` : undefined}
          />
        </InlineGrid>

        {/* Timing metrics */}
        <InlineGrid columns={3} gap="400">
          <MetricCard
            label="Avg. preparation time"
            value={stats.avgPrepTime > 0 ? formatDuration(stats.avgPrepTime) : "-"}
            sublabel="Confirmed to ready"
          />
          <MetricCard
            label="Avg. pickup wait"
            value={stats.avgPickupWait > 0 ? formatDuration(stats.avgPickupWait) : "-"}
            sublabel="Ready to collected"
          />
          <MetricCard
            label="Avg. total turnaround"
            value={stats.avgTotalTurn > 0 ? formatDuration(stats.avgTotalTurn) : "-"}
            sublabel="Confirmed to collected"
          />
        </InlineGrid>

        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              {/* Daily order volume chart */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Daily order volume</Text>
                  {stats.peakDay && (
                    <Text as="p" tone="subdued" variant="bodySm">
                      Peak day: {new Date(stats.peakDay.date + "T00:00:00").toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })} ({stats.peakDay.count} orders)
                    </Text>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "120px" }}>
                    {dailyOrders.map((d) => (
                      <div
                        key={d.date}
                        title={`${new Date(d.date + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}: ${d.count} orders`}
                        style={{
                          flex: 1,
                          minWidth: "3px",
                          height: `${Math.max(2, (d.count / maxDaily) * 100)}%`,
                          background: d.count > 0 ? "var(--p-color-bg-fill-brand)" : "var(--p-color-bg-fill-secondary)",
                          borderRadius: "2px 2px 0 0",
                        }}
                      />
                    ))}
                  </div>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodySm" tone="subdued">
                      {new Date(dailyOrders[0]?.date + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {new Date(dailyOrders[dailyOrders.length - 1]?.date + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>

              {/* Day of week distribution */}
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Busiest days of the week</Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    {stats.busiestDow} is your busiest day with {stats.busiestDowCount} orders
                  </Text>
                  <BlockStack gap="200">
                    {dowCounts.map((d) => (
                      <InlineStack key={d.day} gap="300" blockAlign="center" wrap={false}>
                        <div style={{ width: "32px" }}>
                          <Text as="p" variant="bodySm" fontWeight={d.count === Math.max(...dowCounts.map((x) => x.count)) ? "bold" : "regular"}>
                            {d.day}
                          </Text>
                        </div>
                        <div style={{ flex: 1 }}>
                          <ProgressBar
                            progress={maxDow > 0 ? (d.count / maxDow) * 100 : 0}
                            size="small"
                            tone="primary"
                          />
                        </div>
                        <div style={{ width: "30px", textAlign: "right" }}>
                          <Text as="p" variant="bodySm" tone="subdued">{d.count}</Text>
                        </div>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {/* Status breakdown */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Status breakdown</Text>
                  <Divider />
                  {Object.entries(statusCounts).length === 0 ? (
                    <Text as="p" tone="subdued">No orders in this period</Text>
                  ) : (
                    Object.entries(statusCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([status, count]) => {
                        const cfg = STATUS_LABELS[status] ?? { label: status, tone: "attention" as const };
                        const pct = stats.totalOrders > 0 ? Math.round((count / stats.totalOrders) * 100) : 0;
                        return (
                          <Box key={status}>
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="200" blockAlign="center">
                                <Badge tone={cfg.tone}>{cfg.label}</Badge>
                              </InlineStack>
                              <Text as="p" variant="bodySm">
                                {count} ({pct}%)
                              </Text>
                            </InlineStack>
                          </Box>
                        );
                      })
                  )}
                </BlockStack>
              </Card>

              {/* Location performance */}
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Orders by location</Text>
                  <Divider />
                  {locationStats.length === 0 ? (
                    <Text as="p" tone="subdued">No orders in this period</Text>
                  ) : (
                    locationStats.map((loc) => {
                      const rate = loc.total > 0 ? Math.round((loc.collected / loc.total) * 100) : 0;
                      return (
                        <Box key={loc.name}>
                          <BlockStack gap="100">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="p" fontWeight="semibold">{loc.name}</Text>
                              <Text as="p" variant="bodySm">{loc.total} orders</Text>
                            </InlineStack>
                            <InlineStack gap="300">
                              <Text as="p" variant="bodySm" tone="subdued">
                                {loc.collected} collected ({rate}%)
                              </Text>
                              {loc.active > 0 && (
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {loc.active} active
                                </Text>
                              )}
                            </InlineStack>
                            <ProgressBar
                              progress={rate}
                              size="small"
                              tone={rate >= 80 ? "success" : rate >= 50 ? "highlight" : "primary"}
                            />
                          </BlockStack>
                          <Box paddingBlockStart="200"><Divider /></Box>
                        </Box>
                      );
                    })
                  )}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
