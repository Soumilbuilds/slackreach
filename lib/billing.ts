import prisma from "@/lib/db";
import { type AuthenticatedUser } from "@/lib/auth";
import type { Invoice, Membership, Payment } from "@whop/sdk/resources/shared";
import {
  isWhopReady,
  retrieveWhopInvoice,
  retrieveWhopMembership,
  retrieveWhopPayment,
} from "@/lib/whop";
import {
  getBillingPlan,
  getPlanForProductId,
  getPlanForStoredKey,
  getPlanForWhopPlanId,
  type BillingPlan,
  type PlanKey,
} from "@/lib/plans";

const ACCESS_ALLOWED_STATUSES = new Set(["active", "trialing", "canceling"]);
const BILLING_ISSUE_STATUSES = new Set([
  "past_due",
  "unresolved",
  "canceled",
  "expired",
]);

export type BillingGateDecision = {
  shouldAllowAccess: boolean;
  redirectUrl: string | null;
  reason: string | null;
};

export type BillingSyncResult = {
  memberId: string | null;
  membership: Membership | null;
  payment: Payment | null;
  invoice: Invoice | null;
  hasPaymentMethod: boolean;
  paymentMethodId: string | null;
  plan: BillingPlan | null;
  whopPlanId: string | null;
  whopProductId: string | null;
  planKey: PlanKey | null;
  membershipStatus: string | null;
  cancelAtPeriodEnd: boolean;
  renewalPeriodEnd: Date | null;
};

export type ConnectedAccountAllowance = {
  planKey: PlanKey | null;
  planName: string;
  maxAccounts: number | null;
  currentAccounts: number;
  remainingAccounts: number | null;
};

const derivePlanDetails = (
  user: AuthenticatedUser,
  membership: Membership | null
): {
  plan: BillingPlan | null;
  whopPlanId: string | null;
  whopProductId: string | null;
  planKey: PlanKey | null;
} => {
  const whopPlanId = membership?.plan.id ?? user.whopPlanId ?? null;
  const whopProductId = membership?.product.id ?? user.whopProductId ?? null;

  const fromPlanId = getPlanForWhopPlanId(whopPlanId);
  const fromProductId = getPlanForProductId(whopProductId);
  const fromStoredKey = getPlanForStoredKey(user.subscriptionPlanKey);
  const plan = fromPlanId ?? fromProductId ?? fromStoredKey ?? null;

  return {
    plan,
    whopPlanId,
    whopProductId,
    planKey: plan?.key ?? null,
  };
};

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const updateStoredWhopState = async (
  user: AuthenticatedUser,
  snapshot: {
    membership: Membership | null;
    payment: Payment | null;
    invoice: Invoice | null;
    memberId: string | null;
    paymentMethodId: string | null;
    planDetails: {
      whopPlanId: string | null;
      whopProductId: string | null;
      planKey: PlanKey | null;
    };
  }
): Promise<void> => {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      whopMemberId: snapshot.memberId,
      whopMembershipId: snapshot.membership?.id ?? user.whopMembershipId ?? null,
      whopMembershipStatus:
        snapshot.membership?.status ?? user.whopMembershipStatus ?? null,
      whopRenewalPeriodEnd:
        toDate(snapshot.membership?.renewal_period_end) ??
        user.whopRenewalPeriodEnd ??
        null,
      whopCancelAtPeriodEnd:
        snapshot.membership?.cancel_at_period_end ?? user.whopCancelAtPeriodEnd,
      whopPlanId: snapshot.planDetails.whopPlanId,
      whopProductId: snapshot.planDetails.whopProductId,
      whopPaymentMethodId: snapshot.paymentMethodId,
      whopLastPaymentId: snapshot.payment?.id ?? user.whopLastPaymentId ?? null,
      whopLastPaymentStatus:
        snapshot.payment?.status ?? user.whopLastPaymentStatus ?? null,
      whopLastPaymentSubstatus:
        snapshot.payment?.substatus ?? user.whopLastPaymentSubstatus ?? null,
      whopLastInvoiceId: snapshot.invoice?.id ?? user.whopLastInvoiceId ?? null,
      whopLastInvoiceStatus:
        snapshot.invoice?.status ?? user.whopLastInvoiceStatus ?? null,
      whopLastInvoiceToken:
        snapshot.invoice?.fetch_invoice_token ?? user.whopLastInvoiceToken ?? null,
      subscriptionPlanKey: snapshot.planDetails.planKey,
    },
  });
};

export const syncUserBillingState = async (
  user: AuthenticatedUser
): Promise<BillingSyncResult> => {
  const [membership, payment, invoice] = await Promise.all([
    user.whopMembershipId
      ? retrieveWhopMembership(user.whopMembershipId).catch(() => null)
      : Promise.resolve(null),
    user.whopLastPaymentId
      ? retrieveWhopPayment(user.whopLastPaymentId).catch(() => null)
      : Promise.resolve(null),
    user.whopLastInvoiceId
      ? retrieveWhopInvoice(user.whopLastInvoiceId).catch(() => null)
      : Promise.resolve(null),
  ]);

  const memberId =
    membership?.member?.id ?? payment?.member?.id ?? user.whopMemberId ?? null;
  const paymentMethodId =
    payment?.payment_method?.id ?? user.whopPaymentMethodId ?? null;
  const membershipStatus = membership?.status ?? user.whopMembershipStatus ?? null;
  const cancelAtPeriodEnd =
    membership?.cancel_at_period_end ?? user.whopCancelAtPeriodEnd;
  const renewalPeriodEnd =
    toDate(membership?.renewal_period_end) ?? user.whopRenewalPeriodEnd ?? null;
  const planDetails = derivePlanDetails(user, membership);

  await updateStoredWhopState(user, {
    membership,
    payment,
    invoice,
    memberId,
    paymentMethodId,
    planDetails,
  });

  return {
    memberId,
    membership,
    payment,
    invoice,
    hasPaymentMethod: Boolean(paymentMethodId),
    paymentMethodId,
    plan: planDetails.plan,
    whopPlanId: planDetails.whopPlanId,
    whopProductId: planDetails.whopProductId,
    planKey: planDetails.planKey,
    membershipStatus,
    cancelAtPeriodEnd,
    renewalPeriodEnd,
  };
};

export const resolveBillingGate = async (
  user: AuthenticatedUser
): Promise<BillingGateDecision> => {
  if (!isWhopReady()) {
    return {
      shouldAllowAccess: true,
      redirectUrl: null,
      reason: null,
    };
  }

  const billing = await syncUserBillingState(user);
  const membershipStatus = billing.membershipStatus;

  if (membershipStatus && ACCESS_ALLOWED_STATUSES.has(membershipStatus)) {
    if (!billing.plan) {
      return {
        shouldAllowAccess: false,
        redirectUrl: "/billing/select",
        reason: "Plan could not be resolved from your active Whop membership.",
      };
    }

    return {
      shouldAllowAccess: true,
      redirectUrl: null,
      reason: null,
    };
  }

  if (membershipStatus && BILLING_ISSUE_STATUSES.has(membershipStatus)) {
    return {
      shouldAllowAccess: false,
      redirectUrl: "/billing/blocked",
      reason: `Billing issue (${membershipStatus}).`,
    };
  }

  return {
    shouldAllowAccess: false,
    redirectUrl: "/billing/select",
    reason: membershipStatus
      ? `Membership is ${membershipStatus}.`
      : "No active trial or subscription.",
  };
};

export const getConnectedAccountAllowance = async (
  user: AuthenticatedUser
): Promise<ConnectedAccountAllowance> => {
  const currentAccounts = await prisma.account.count({
    where: { userId: user.id },
  });

  if (!isWhopReady()) {
    return {
      planKey: "unlimited",
      planName: "Unlimited",
      maxAccounts: null,
      currentAccounts,
      remainingAccounts: null,
    };
  }

  const billing = await syncUserBillingState(user);
  if (!billing.membershipStatus || !ACCESS_ALLOWED_STATUSES.has(billing.membershipStatus)) {
    return {
      planKey: null,
      planName: "No Active Plan",
      maxAccounts: 0,
      currentAccounts,
      remainingAccounts: 0,
    };
  }

  const resolvedPlan = billing.plan ?? getBillingPlan("starter");
  const maxAccounts = resolvedPlan.accountLimit;
  const remainingAccounts =
    maxAccounts == null ? null : Math.max(0, maxAccounts - currentAccounts);

  return {
    planKey: resolvedPlan.key,
    planName: resolvedPlan.name,
    maxAccounts,
    currentAccounts,
    remainingAccounts,
  };
};
