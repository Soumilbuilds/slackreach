import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import { getBillingPlan, isPlanConfigured, parsePlanKey } from "@/lib/plans";
import {
  buildBillingMetadata,
  chargeWhopMemberForPlan,
  isWhopReady,
  voidWhopPayment,
} from "@/lib/whop";

const ACCESS_ALLOWED_STATUSES = new Set(["active", "trialing", "canceling"]);

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
  const planKey = parsePlanKey(body.planKey);

  if (!planKey) {
    return NextResponse.json(
      { error: "Valid plan key is required (starter, growth, unlimited)." },
      { status: 400 }
    );
  }

  const plan = getBillingPlan(planKey);
  if (!isPlanConfigured(plan)) {
    return NextResponse.json(
      { error: `Whop plan is missing for ${plan.name}.` },
      { status: 500 }
    );
  }

  const billing = await syncUserBillingState(authResult.user);

  if (billing.planKey === planKey) {
    return NextResponse.json(
      { error: `${plan.name} is already your current plan.` },
      { status: 400 }
    );
  }

  if (
    !billing.membershipStatus ||
    !ACCESS_ALLOWED_STATUSES.has(billing.membershipStatus)
  ) {
    return NextResponse.json(
      {
        error: "No active membership to change. Start checkout instead.",
        fallbackToCheckout: true,
        redirectUrl: `/billing/select?plan=${planKey}&intent=plan_change`,
      },
      { status: 400 }
    );
  }

  if (!billing.memberId || !billing.paymentMethodId) {
    return NextResponse.json(
      {
        error: "No reusable payment method is on file. Start checkout instead.",
        fallbackToCheckout: true,
        redirectUrl: `/billing/select?plan=${planKey}&intent=plan_change`,
      },
      { status: 400 }
    );
  }

  try {
    const payment = await chargeWhopMemberForPlan({
      memberId: billing.memberId,
      paymentMethodId: billing.paymentMethodId,
      planId: plan.whopPlanId,
      metadata: buildBillingMetadata({
        userId: authResult.user.id,
        email: authResult.user.email,
        planKey,
        action: "plan_change",
        previousMembershipId: billing.membership?.id ?? null,
        previousPaymentId: billing.payment?.id ?? null,
      }),
    });

    await prisma.user.update({
      where: { id: authResult.user.id },
      data: {
        whopLastPaymentId: payment.id,
        whopLastPaymentStatus: payment.status,
        whopLastPaymentSubstatus: payment.substatus,
        whopPaymentMethodId:
          payment.payment_method?.id ?? authResult.user.whopPaymentMethodId,
      },
    });

    if (payment.status === "paid" || payment.substatus === "succeeded") {
      return NextResponse.json({
        success: true,
        pending: false,
        plan: {
          key: plan.key,
          name: plan.name,
          monthlyPriceUsd: plan.monthlyPriceUsd,
          accountLimit: plan.accountLimit,
        },
      });
    }

    if (payment.status === "pending") {
      return NextResponse.json({
        success: true,
        pending: true,
        paymentId: payment.id,
        paymentStatus: payment.status,
        paymentSubstatus: payment.substatus,
        message: "Your payment is processing.",
      });
    }

    if (payment.voidable) {
      await voidWhopPayment(payment.id).catch(() => undefined);
    }

    return NextResponse.json(
      {
        error:
          payment.failure_message ||
          "The saved card could not be charged. Continue in checkout.",
        fallbackToCheckout: true,
        redirectUrl: `/billing/select?plan=${planKey}&intent=plan_change`,
      },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to change your plan.";

    return NextResponse.json(
      {
        error: message,
        fallbackToCheckout: true,
        redirectUrl: `/billing/select?plan=${planKey}&intent=plan_change`,
      },
      { status: 400 }
    );
  }
}
