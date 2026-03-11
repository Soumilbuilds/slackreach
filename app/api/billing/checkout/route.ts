import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import { getCheckoutPlan, isPlanConfigured, parsePlanKey } from "@/lib/plans";
import {
  buildBillingMetadata,
  createWhopCheckoutSession,
  isWhopReady,
} from "@/lib/whop";

type CheckoutIntent = "signup" | "recover" | "plan_change" | "account_limit_upgrade";

const parseCheckoutIntent = (value: unknown): CheckoutIntent => {
  switch (value) {
    case "recover":
    case "plan_change":
    case "account_limit_upgrade":
      return value;
    default:
      return "signup";
  }
};

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  if (!isWhopReady()) {
    return NextResponse.json(
      { error: "Whop billing is not configured yet." },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const planKey = parsePlanKey(body.planKey) ?? "starter";
  const intent = parseCheckoutIntent(body.intent);
  const plan = getCheckoutPlan(planKey, {
    allowStarterTrial: intent === "signup",
  });

  if (!isPlanConfigured(plan)) {
    return NextResponse.json(
      { error: `Whop plan is missing for ${plan.name}.` },
      { status: 500 }
    );
  }

  const billing = await syncUserBillingState(authResult.user);
  const session = await createWhopCheckoutSession({
    planId: plan.whopPlanId,
    metadata: buildBillingMetadata({
      userId: authResult.user.id,
      email: authResult.user.email,
      planKey,
      action: intent,
      previousMembershipId: billing.membership?.id ?? null,
      previousPaymentId: billing.payment?.id ?? null,
    }),
  });

  return NextResponse.json({
    sessionId: session.id,
    purchaseUrl: session.purchaseUrl,
    plan: {
      key: plan.key,
      name: plan.name,
      monthlyPriceUsd: plan.monthlyPriceUsd,
      accountLimit: plan.accountLimit,
      trialDays: plan.trialDays,
    },
    currentPlanKey: billing.planKey,
    membershipStatus: billing.membershipStatus,
  });
}
