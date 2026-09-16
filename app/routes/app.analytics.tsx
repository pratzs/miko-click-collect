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
  Button,
  ButtonGroup,
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

/** "1 order", "4 orders". Shown four times on this page, all of them wrong. */
function orderCount(n: number): string {
  return `${n} ${n === 1 ? "order" : "orders"}`;
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

/**
 * Which day an order belongs to, in the shop's own timezone.
 *
 * `createdAt` is stored as a naive UTC timestamp, and the two day-based charts
 * on this page used to bucket it two different ways: the daily chart called
 * toISOString() (UTC) and the weekday chart called getDay() (whichever timezone
 * the Node process happened to be in). Railway runs its containers in UTC, so
 * for the New Zealand retailers this app is sold to, midnight UTC falls at
 * midday local — roughly half of every day's orders were being counted on the
 * wrong weekday, and the two charts on the same screen disagreed with each
 * other. "Your busiest day is Thursday" is not a number a store manager will
 * shrug at when they know perfectly well it is Saturday.
 *
 * Both charts now bucket in the shop's configured timezone, which is what the
 * merchant's roster and their own tills use.
 */
function safeTimeZone(tz: string | undefined | null): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/**
 * Every number on this page is computed by Postgres, not by Node.
 *
 * It used to load every order in the range into memory with `include:
 * pickupLocation` and loop over the array, plus a second query that fetched the
 * id of every order the shop had ever taken just to call `.length` on it. That
 * is fine for a shop doing five pickups a week and fatal for the kind of
 * retailer this app is built for. Measured against a seeded 200,000-order,
 * 70-store dataset on real Postgres:
 *
 *     30 days   as shipped    471 ms    +99 MB heap
 *     90 days   as shipped   1380 ms   +207 MB heap
 *    365 days   as shipped   8203 ms   +909 MB heap
 *    all-time id list         415 ms    +29 MB heap   (to produce ONE number)
 *
 * 909 MB of heap in a single loader is not a slow page, it is an out-of-memory
 * kill — and the container is shared, so one merchant opening Analytics takes
 * the app down for every other merchant on it. The rewrite below moves the
 * grouping, the averages and the sums into SQL, so what crosses into Node is a
 * few dozen rows regardless of how many orders sit behind them.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const config = await db.shopConfig.findUnique({ where: { shop } });
  const planName = config?.planName ?? "free";

  if (planName === "free" || planName === "starter") {
    return json({ allowed: false as const, planName });
  }

  const url = new URL(request.url);
  // Only the ranges the UI offers. `range` is a URL parameter, so without this
  // anyone could ask for ?range=100000 and hand the loader the whole table.
  const ALLOWED_RANGES = [7, 14, 30, 90];
  const requested = parseInt(url.searchParams.get("range") ?? "30", 10);
  const days = ALLOWED_RANGES.includes(requested) ? requested : 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  const ACTIVE = ["confirmed", "pending", "processing", "packing", "ready"];
  const timeZone = safeTimeZone(config?.timezone);
  // The column is a naive UTC timestamp: read it as UTC, then render it as
  // local wall time before bucketing.
  const LOCAL = `("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE $3)`;

  // The range boundary, pinned to UTC in the SQL itself.
  //
  // Handing a JS Date straight to a raw query and comparing it against this
  // naive-UTC column makes the result depend on the DATABASE SESSION's
  // timezone, which is not ours to assume. Measured on a Postgres session set
  // to Pacific/Auckland, the same boundary landed twelve hours out and pulled
  // an extra day into every figure on the page. Our own Railway Postgres
  // happens to run in UTC, which is exactly what makes this worth pinning: it
  // would have looked perfect here and quietly skewed someone else's numbers.
  const SINCE = `($2::timestamptz AT TIME ZONE 'UTC')`;
  const sinceIso = since.toISOString();

  // A money column stored as text. Anything that is not a plain number (an
  // empty string on an order Shopify sent without a total) counts as zero
  // rather than blowing up the whole query.
  const MONEY = (col: string) =>
    `SUM(CASE WHEN "${col}" ~ '^[0-9]+(\\.[0-9]+)?$' THEN "${col}"::numeric ELSE 0 END)`;

  type Totals = {
    total: bigint;
    collected: bigint;
    ready: bigint;
    active: bigint;
    revenue: string | null;
    fees: string | null;
    avg_prep: number | null;
    avg_wait: number | null;
    avg_turn: number | null;
  };

  const [totalsRows, statusRows, locationRows, dayRows, dowRows, totalAllTime] = await Promise.all([
    db.$queryRawUnsafe<Totals[]>(
      `SELECT
         COUNT(*)::bigint AS total,
         COUNT(*) FILTER (WHERE status = 'picked_up')::bigint AS collected,
         COUNT(*) FILTER (WHERE status = 'ready')::bigint AS ready,
         COUNT(*) FILTER (WHERE status = ANY($3))::bigint AS active,
         ${MONEY("totalPrice")} AS revenue,
         ${MONEY("serviceFee")} AS fees,
         AVG(EXTRACT(EPOCH FROM ("readyAt" - "confirmedAt")) / 60)
           FILTER (WHERE "readyAt" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "readyAt" >= "confirmedAt") AS avg_prep,
         AVG(EXTRACT(EPOCH FROM ("pickedUpAt" - "readyAt")) / 60)
           FILTER (WHERE "pickedUpAt" IS NOT NULL AND "readyAt" IS NOT NULL AND "pickedUpAt" >= "readyAt") AS avg_wait,
         AVG(EXTRACT(EPOCH FROM ("pickedUpAt" - "confirmedAt")) / 60)
           FILTER (WHERE "pickedUpAt" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "pickedUpAt" >= "confirmedAt") AS avg_turn
       FROM "ClickCollectOrder"
       WHERE shop = $1 AND "createdAt" >= ${SINCE}`,
      shop, sinceIso, ACTIVE,
    ),
    db.clickCollectOrder.groupBy({
      by: ["status"],
      where: { shop, createdAt: { gte: since } },
      _count: true,
    }),
    db.$queryRawUnsafe<Array<{ name: string; total: bigint; collected: bigint; active: bigint }>>(
      `SELECT l.name AS name,
              COUNT(*)::bigint AS total,
              COUNT(*) FILTER (WHERE o.status = 'picked_up')::bigint AS collected,
              COUNT(*) FILTER (WHERE o.status = ANY($3))::bigint AS active
         FROM "ClickCollectOrder" o
         JOIN "PickupLocation" l ON l.id = o."pickupLocationId"
        WHERE o.shop = $1 AND o."createdAt" >= ${SINCE}
        GROUP BY l.name
        -- Name breaks the tie. Without it two stores on the same count swap
        -- places between page loads, and a 70-store table looks like it is
        -- shuffling itself every time the manager refreshes.
        ORDER BY total DESC, l.name ASC`,
      shop, sinceIso, ACTIVE,
    ),
    db.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
      `SELECT to_char(date_trunc('day', ${LOCAL}), 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
         FROM "ClickCollectOrder"
        WHERE shop = $1 AND "createdAt" >= ${SINCE}
        GROUP BY 1 ORDER BY 1`,
      shop, sinceIso, timeZone,
    ),
    db.$queryRawUnsafe<Array<{ dow: number; count: bigint }>>(
      `SELECT EXTRACT(DOW FROM ${LOCAL})::int AS dow, COUNT(*)::bigint AS count
         FROM "ClickCollectOrder"
        WHERE shop = $1 AND "createdAt" >= ${SINCE}
        GROUP BY 1`,
      shop, sinceIso, timeZone,
    ),
    db.clickCollectOrder.count({ where: { shop } }),
  ]);

  const t = totalsRows[0] ?? ({} as Totals);
  const num = (v: bigint | number | null | undefined) => Number(v ?? 0);
  const mins = (v: number | string | null | undefined) => (v == null ? 0 : Math.round(Number(v)));

  const totalOrders = num(t.total);
  const collectedCount = num(t.collected);
  const collectionRate = totalOrders > 0 ? Math.round((collectedCount / totalOrders) * 100) : 0;

  const locationStats = locationRows.map((r) => ({
    name: r.name,
    total: num(r.total),
    collected: num(r.collected),
    active: num(r.active),
  }));

  // Postgres only returns days that have orders. The chart needs every day in
  // the range, including the quiet ones, or a shop that closes on Sunday draws
  // a graph with no Sundays in it.
  const dayMap = new Map<string, number>();
  for (const r of dayRows) dayMap.set(r.day, num(r.count));

  // en-CA formats as YYYY-MM-DD, which is the shape Postgres returned above.
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dailyOrders: Array<{ date: string; count: number }> = [];
  const cursor = new Date(since);
  const now = new Date();
  const seenDays = new Set<string>();
  while (cursor <= now) {
    const key = dayKey.format(cursor);
    if (!seenDays.has(key)) {
      seenDays.add(key);
      dailyOrders.push({ date: key, count: dayMap.get(key) ?? 0 });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const peakDay = dailyOrders.reduce((max, d) => (d.count > max.count ? d : max), { date: "", count: 0 });

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowCounts = Array(7).fill(0) as number[];
  for (const r of dowRows) dowCounts[r.dow] = num(r.count);
  const busiestDow = dowCounts.indexOf(Math.max(...dowCounts));

  const statusCounts: Record<string, number> = {};
  for (const r of statusRows) statusCounts[r.status] = r._count;

  const currency = config?.currency ?? "NZD";

  return json({
    allowed: true as const,
    planName,
    range: days,
    stats: {
      totalOrders,
      totalAllTime,
      collectedCount,
      activeCount: num(t.active),
      readyCount: num(t.ready),
      collectionRate,
      avgPrepTime: mins(t.avg_prep),
      avgPickupWait: mins(t.avg_wait),
      avgTotalTurn: mins(t.avg_turn),
      totalRevenue: Number(t.revenue ?? 0).toFixed(2),
      totalServiceFees: Number(t.fees ?? 0).toFixed(2),
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
        {/* Range selector.
            These were bare <div onClick> tiles: not reachable by keyboard, not
            announced as controls, and no pressed state for a screen reader — so
            the page could not be operated without a mouse at all. Polaris
            buttons give all of that for free and look the part. */}
        <ButtonGroup variant="segmented">
          {[7, 14, 30, 90].map((d) => (
            <Button
              key={d}
              pressed={range === d}
              onClick={() => navigate(`/app/analytics?range=${d}`)}
              accessibilityLabel={`Show the last ${d} days`}
            >
              {`${d} days`}
            </Button>
          ))}
        </ButtonGroup>

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
                      Peak day: {new Date(stats.peakDay.date + "T00:00:00").toLocaleDateString("en-NZ", { weekday: "short", day: "numeric", month: "short" })} ({orderCount(stats.peakDay.count)})
                    </Text>
                  )}
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "120px" }}>
                    {dailyOrders.map((d) => (
                      <div
                        key={d.date}
                        title={`${new Date(d.date + "T00:00:00").toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}: ${orderCount(d.count)}`}
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
                    {stats.busiestDow} is your busiest day with {orderCount(stats.busiestDowCount)}
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
                              <Text as="p" variant="bodySm">{orderCount(loc.total)}</Text>
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
