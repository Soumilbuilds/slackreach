import { NextResponse } from "next/server";
import { BILLING_PLANS } from "@/lib/plans";

export async function GET() {
  const plans = BILLING_PLANS.map((plan) => ({
    key: plan.key,
    name: plan.name,
    monthlyPriceUsd: plan.monthlyPriceUsd,
    accountLimit: plan.accountLimit,
    trialDays: plan.trialDays,
    features: plan.features,
  }));

  return NextResponse.json({ plans });
}
