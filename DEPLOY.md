# Miko Click & Collect — Deploy Guide

## Overview
Shopify public app. Remix + Prisma + PostgreSQL on Railway. Same stack as miko-product-rentals.

## First-time setup

### 1. Create Shopify app
```
cd /Users/pratham/Developer/Tripster_Developers/Apps/miko-click-collect
shopify app config link   # or create new in Partner Dashboard → Apps → Create app
```
Update `shopify.app.toml` with the real `client_id`.

### 2. Environment variables (Railway)
```
DATABASE_URL=postgresql://...
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_APP_URL=https://miko-click-collect-production.up.railway.app
SCOPES=read_products,read_orders,write_orders,read_customers,write_customers
SHOPIFY_BILLING_TEST=false   # set to false in production
```

### 3. Database
```
npx prisma db push    # first deploy — creates all tables
```

### 4. Deploy to Railway
```
git init && git add . && git commit -m "initial"
railway link     # link to Railway project
railway up       # deploy
```

### 5. Checkout Extension
The checkout extension must be deployed via `shopify app deploy` to appear in merchant checkout customization settings.
After deploying:
1. Partners Dashboard → App → Extensions → Click & Collect Checkout
2. Set the `app_url` setting to `https://miko-click-collect-production.up.railway.app`
3. Activate the extension in the merchant's Checkout editor

### 6. Dev
```
shopify app dev --store pratham-testing-store.myshopify.com
```

## How the flow works

1. **Merchant** installs app → adds pickup location(s)
2. **Customer** sees "Click & Collect" checkbox at Shopify checkout (via UI Extension)
3. Customer selects a location → order attributes written: `miko_pickup_method=click_and_collect`, `miko_location_id=...`
4. Order paid → `orders/paid` webhook fires → app creates `ClickCollectOrder` record
5. **Merchant** sees order in app dashboard → clicks "Mark as Ready" → email sent to customer
6. Customer comes in, merchant clicks "Mark as Picked Up" → confirmation email sent
7. Order history tracked in app

## Pricing plans
- Free: 1 location, 50 orders/month, Miko badge
- Starter ($9.95/mo): 3 locations, 500 orders/month, custom SMTP, no badge
- Growth ($29.95/mo): unlimited locations, unlimited orders

## App structure
```
app/routes/
  app._index.tsx          → Dashboard (stats + recent orders)
  app.orders.tsx          → Orders list (filter by status/location)
  app.orders.$id.tsx      → Order detail (mark ready / mark picked up)
  app.locations.tsx       → Locations list
  app.locations.$id.tsx   → Location create/edit (name, address, hours, prep time)
  app.settings.tsx        → Email, SMTP, brand settings
  app.pricing.tsx         → Plan management
  api.public.locations.tsx → Public API for checkout extension (CORS open)
  api.billing.subscribe.tsx → Billing subscription handler
  webhooks.orders.paid.tsx  → Captures C&C orders
  webhooks.orders.cancelled.tsx → Cancels C&C order if Shopify order cancelled
  health.tsx              → Railway health check

extensions/click-collect-checkout/
  src/Checkout.tsx        → Checkout UI Extension (React)
```
