export const PLANS = {
  free: {
    name: "Free",
    price: 0,
    locationLimit: 1,
    orderLimit: 50,    // orders per month
    badge: true,
    smtp: false,
  },
  starter: {
    name: "Starter",
    price: 9.95,
    locationLimit: 3,
    orderLimit: 500,
    badge: false,
    smtp: true,
  },
  growth: {
    name: "Growth",
    price: 29.95,
    locationLimit: 999,  // unlimited
    orderLimit: 999999,  // unlimited
    badge: false,
    smtp: true,
  },
} as const;

export type PlanName = keyof typeof PLANS;

export function getPlan(planName: string) {
  return PLANS[(planName as PlanName)] ?? PLANS.free;
}

export function canAddLocation(planName: string, currentCount: number): boolean {
  return currentCount < getPlan(planName).locationLimit;
}

export function hasSmtp(planName: string): boolean {
  return getPlan(planName).smtp;
}

export function hasBadge(planName: string): boolean {
  return getPlan(planName).badge;
}
