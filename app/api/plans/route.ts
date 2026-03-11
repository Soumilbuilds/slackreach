import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import { BILLING_PLANS } from "@/lib/plans";
import { WHOP_PLAN_ID_STARTER_NO_TRIAL } from "@/lib/whop-config";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  const billing = user ? await syncUserBillingState(user).catch(() => null) : null;
  const shouldHideStarterTrial =
    billing?.planKey === "starter" &&
    billing.whopPlanId === WHOP_PLAN_ID_STARTER_NO_TRIAL;

  const plans = BILLING_PLANS.map((plan) => ({
    key: plan.key,
    name: plan.name,
    monthlyPriceUsd: plan.monthlyPriceUsd,
    accountLimit: plan.accountLimit,
    trialDays: shouldHideStarterTrial && plan.key === "starter" ? 0 : plan.trialDays,
    features: plan.features,
  }));

  return NextResponse.json({ plans });
}
