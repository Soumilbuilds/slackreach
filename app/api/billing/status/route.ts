import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import { isWhopReady } from "@/lib/whop";
import { WHOP_PLAN_ID_STARTER_NO_TRIAL } from "@/lib/whop-config";

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  if (!isWhopReady()) {
    return NextResponse.json({
      status: "ok",
      membershipStatus: null,
      paymentStatus: null,
      paymentSubstatus: null,
      paymentId: null,
      invoiceId: null,
      invoiceStatus: null,
      planName: null,
      planKey: null,
      hasPaymentMethod: false,
      canRetryPayment: false,
      canVoidPayment: false,
      cancelAtPeriodEnd: false,
      renewalPeriodEnd: null,
    });
  }

  const billing = await syncUserBillingState(authResult.user);
  const membershipStatus =
    billing.membershipStatus === "trialing" &&
    billing.planKey === "starter" &&
    billing.whopPlanId === WHOP_PLAN_ID_STARTER_NO_TRIAL
      ? "active"
      : billing.membershipStatus;

  return NextResponse.json({
    status: membershipStatus ?? "none",
    membershipStatus,
    paymentStatus: billing.payment?.status ?? authResult.user.whopLastPaymentStatus ?? null,
    paymentSubstatus:
      billing.payment?.substatus ?? authResult.user.whopLastPaymentSubstatus ?? null,
    paymentId: billing.payment?.id ?? authResult.user.whopLastPaymentId ?? null,
    invoiceId: billing.invoice?.id ?? authResult.user.whopLastInvoiceId ?? null,
    invoiceStatus: billing.invoice?.status ?? authResult.user.whopLastInvoiceStatus ?? null,
    planName: billing.plan?.name ?? null,
    planKey: billing.plan?.key ?? null,
    hasPaymentMethod: billing.hasPaymentMethod,
    canRetryPayment: Boolean(billing.payment?.retryable),
    canVoidPayment: Boolean(billing.payment?.voidable),
    cancelAtPeriodEnd: billing.cancelAtPeriodEnd,
    renewalPeriodEnd: billing.renewalPeriodEnd?.toISOString() ?? null,
  });
}
