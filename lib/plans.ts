import {
  WHOP_PLAN_ID_GROWTH,
  WHOP_PLAN_ID_STARTER,
  WHOP_PLAN_ID_UNLIMITED,
  WHOP_PRODUCT_ID,
  WHOP_STARTER_TRIAL_DAYS,
} from "@/lib/whop-config";

export type PlanKey = "starter" | "growth" | "unlimited";

export type PlanFeature = {
  label: string;
  included: boolean;
};

export type BillingPlan = {
  key: PlanKey;
  name: string;
  monthlyPriceUsd: number;
  accountLimit: number | null;
  whopPlanId: string;
  whopProductId: string;
  trialDays: number;
  features: PlanFeature[];
};

const PLAN_ORDER: PlanKey[] = ["starter", "growth", "unlimited"];

const PLAN_MAP: Record<PlanKey, BillingPlan> = {
  starter: {
    key: "starter",
    name: "Starter",
    monthlyPriceUsd: 49,
    accountLimit: 1,
    whopPlanId: WHOP_PLAN_ID_STARTER,
    whopProductId: WHOP_PRODUCT_ID,
    trialDays: WHOP_STARTER_TRIAL_DAYS,
    features: [
      { label: "1 Slack Account", included: true },
      { label: "Unlimited Lead Scraping", included: true },
      { label: "Unlimited Campaigns", included: true },
      { label: "Personalisation & Spintax", included: true },
      { label: "A/B Testing", included: true },
      { label: "Anti-Ban Technology", included: true },
      { label: "AI Message Timing Optimisation", included: false },
      { label: "Lead Sourcing Database", included: true },
      { label: "24/7 Support", included: true },
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    monthlyPriceUsd: 99,
    accountLimit: 5,
    whopPlanId: WHOP_PLAN_ID_GROWTH,
    whopProductId: WHOP_PRODUCT_ID,
    trialDays: 0,
    features: [
      { label: "5 Slack Accounts", included: true },
      { label: "Unlimited Lead Scraping", included: true },
      { label: "Unlimited Campaigns", included: true },
      { label: "Personalisation & Spintax", included: true },
      { label: "A/B Testing", included: true },
      { label: "Anti-Ban Technology", included: true },
      { label: "AI Message Timing Optimisation", included: true },
      { label: "Lead Sourcing Database", included: true },
      { label: "24/7 Support", included: true },
    ],
  },
  unlimited: {
    key: "unlimited",
    name: "Unlimited",
    monthlyPriceUsd: 199,
    accountLimit: null,
    whopPlanId: WHOP_PLAN_ID_UNLIMITED,
    whopProductId: WHOP_PRODUCT_ID,
    trialDays: 0,
    features: [
      { label: "Unlimited Slack Accounts", included: true },
      { label: "Unlimited Lead Scraping", included: true },
      { label: "Unlimited Campaigns", included: true },
      { label: "Personalisation & Spintax", included: true },
      { label: "A/B Testing", included: true },
      { label: "Anti-Ban Technology", included: true },
      { label: "AI Message Timing Optimisation", included: true },
      { label: "Lead Sourcing Database", included: true },
      { label: "24/7 Support", included: true },
    ],
  },
};

export const BILLING_PLANS: BillingPlan[] = PLAN_ORDER.map((key) => PLAN_MAP[key]);

export const getBillingPlan = (planKey: PlanKey): BillingPlan => PLAN_MAP[planKey];

export const parsePlanKey = (value: unknown): PlanKey | null => {
  if (typeof value !== "string") {
    return null;
  }

  const key = value.trim().toLowerCase();
  if (key === "starter" || key === "growth" || key === "unlimited") {
    return key;
  }

  return null;
};

const isConfiguredValue = (value: string): boolean =>
  Boolean(value) && !value.startsWith("REPLACE_WITH_");

export const isPlanConfigured = (plan: BillingPlan): boolean =>
  isConfiguredValue(plan.whopPlanId) && isConfiguredValue(plan.whopProductId);

export const areBillingPlansConfigured = (): boolean =>
  BILLING_PLANS.every((plan) => isPlanConfigured(plan));

export const getPlanForWhopPlanId = (
  planId: string | null | undefined
): BillingPlan | null => {
  if (!planId) {
    return null;
  }
  return BILLING_PLANS.find((plan) => plan.whopPlanId === planId) ?? null;
};

export const getPlanForProductId = (
  productId: string | null | undefined
): BillingPlan | null => {
  if (!productId) {
    return null;
  }
  return BILLING_PLANS.find((plan) => plan.whopProductId === productId) ?? null;
};

export const getPlanForStoredKey = (
  planKey: string | null | undefined
): BillingPlan | null => {
  const parsed = parsePlanKey(planKey);
  return parsed ? getBillingPlan(parsed) : null;
};

export const PLAN_INDEX: Record<PlanKey, number> = {
  starter: 0,
  growth: 1,
  unlimited: 2,
};
