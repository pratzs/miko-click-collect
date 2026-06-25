import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Divider,
  Box,
  Tabs,
  EmptyState,
  Filters,
  ChoiceList,
  Spinner,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { db } from "../db.server";
import { format } from "date-fns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const locationFilter = url.searchParams.get("location") ?? "";

  const whereClause: Record<string, unknown> = { shop };
  if (statusFilter === "active") {
    whereClause.status = { in: ["confirmed", "pending", "processing", "packing"] };
  } else if (statusFilter !== "all") {
    whereClause.status = statusFilter;
  }
  if (locationFilter) whereClause.pickupLocationId = locationFilter;

  const [orders, locations, counts] = await Promise.all([
    db.clickCollectOrder.findMany({
      where: whereClause,
      include: { pickupLocation: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.pickupLocation.findMany({ where: { shop, isActive: true }, orderBy: { name: "asc" } }),
    db.clickCollectOrder.groupBy({
      by: ["status"],
      where: { shop },
      _count: true,
    }),
  ]);

  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.status] = c._count;

  return json({
    orders: orders.map((o) => ({
      id: o.id,
      orderName: o.shopifyOrderName,
      customerName: o.customerName,
      customerEmail: o.customerEmail,
      locationName: o.pickupLocation.name,
      status: o.status,
      totalPrice: o.totalPrice,
      currency: o.currency,
      expectedReadyAt: o.expectedReadyAt?.toISOString() ?? null,
      readyAt: o.readyAt?.toISOString() ?? null,
      pickedUpAt: o.pickedUpAt?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    })),
    locations: locations.map((l) => ({ id: l.id, name: l.name })),
    countMap,
    statusFilter,
    locationFilter,
  });
};

const STATUS_BADGE: Record<string, { tone: "attention" | "success" | "info" | "critical" | "warning"; label: string }> = {
  confirmed: { tone: "attention", label: "Confirmed" },
  pending: { tone: "attention", label: "Confirmed" },
  processing: { tone: "warning", label: "Processing" },
  packing: { tone: "info", label: "Packing" },
  ready: { tone: "info", label: "Ready" },
  picked_up: { tone: "success", label: "Collected" },
  cancelled: { tone: "critical", label: "Cancelled" },
};

const TABS = [
  { id: "all", content: "All" },
  { id: "active", content: "Active" },
  { id: "ready", content: "Ready" },
  { id: "picked_up", content: "Collected" },
];

export default function OrdersPage() {
  const { orders, locations, countMap, statusFilter, locationFilter } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedTabIndex = TABS.findIndex((t) => t.id === statusFilter) ?? 0;
  const safeTabIndex = selectedTabIndex < 0 ? 0 : selectedTabIndex;

  function handleTabChange(idx: number) {
    const newStatus = TABS[idx].id;
    const params = new URLSearchParams(searchParams);
    if (newStatus === "all") params.delete("status");
    else params.set("status", newStatus);
    setSearchParams(params);
  }

  function handleLocationFilter(value: string[]) {
    const params = new URLSearchParams(searchParams);
    if (!value.length || value[0] === "") params.delete("location");
    else params.set("location", value[0]);
    setSearchParams(params);
  }

  const activeCount = (countMap["confirmed"] ?? 0) + (countMap["pending"] ?? 0) + (countMap["processing"] ?? 0) + (countMap["packing"] ?? 0);
  const tabsWithCount = TABS.map((t) => ({
    ...t,
    content:
      t.id === "all"
        ? `All (${Object.values(countMap).reduce((a, b) => a + b, 0)})`
        : t.id === "active"
          ? `Active (${activeCount})`
          : `${t.content} (${countMap[t.id] ?? 0})`,
  }));

  return (
    <Page title="Click and Collect Orders">
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={tabsWithCount} selected={safeTabIndex} onSelect={handleTabChange} />

            <Box padding="300">
              <Filters
                queryValue=""
                queryPlaceholder="Search orders..."
                filters={[
                  {
                    key: "location",
                    label: "Location",
                    filter: (
                      <ChoiceList
                        title="Location"
                        titleHidden
                        choices={[
                          { label: "All locations", value: "" },
                          ...locations.map((l) => ({ label: l.name, value: l.id })),
                        ]}
                        selected={[locationFilter]}
                        onChange={handleLocationFilter}
                      />
                    ),
                    shortcut: true,
                  },
                ]}
                appliedFilters={
                  locationFilter
                    ? [
                        {
                          key: "location",
                          label: `Location: ${locations.find((l) => l.id === locationFilter)?.name ?? locationFilter}`,
                          onRemove: () => handleLocationFilter([""]),
                        },
                      ]
                    : []
                }
                onQueryChange={() => {}}
                onQueryClear={() => {}}
                onClearAll={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("location");
                  setSearchParams(params);
                }}
              />
            </Box>

            <Divider />

            {orders.length === 0 ? (
              <EmptyState
                heading="No orders found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Click &amp; collect orders will appear here once customers choose pickup at checkout.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="0">
                {orders.map((order, idx) => {
                  const badge = STATUS_BADGE[order.status] ?? { tone: "attention", label: order.status };
                  return (
                    <Box key={order.id}>
                      {idx > 0 && <Divider />}
                      <Box padding="400">
                        <InlineStack align="space-between" wrap={false} gap="400">
                          <BlockStack gap="100">
                            <InlineStack gap="200">
                              <Text variant="bodyMd" fontWeight="semibold" as="span">{order.orderName}</Text>
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                            </InlineStack>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {order.customerName || order.customerEmail} · {order.locationName}
                            </Text>
                            <Text variant="bodySm" tone="subdued" as="p">
                              {format(new Date(order.createdAt), "d MMM yyyy, h:mm a")}
                              {order.totalPrice ? ` · ${order.currency} ${order.totalPrice}` : ""}
                            </Text>
                          </BlockStack>
                          <Button variant="plain" size="slim" onClick={() => navigate(`/app/orders/${order.id}`)}>
                            Manage
                          </Button>
                        </InlineStack>
                      </Box>
                    </Box>
                  );
                })}
              </BlockStack>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
