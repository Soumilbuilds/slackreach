import prisma from "@/lib/db";
import { type AuthenticatedUser } from "@/lib/auth";
import type { Invoice, Membership, Payment } from "@whop/sdk/resources/shared";
import {
  isWhopReady,
  recoverWhopBillingStateByEmail,
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

const MEMBERSHIP_STATUS_PRIORITY: Record<string, number> = {
  active: 7,
  trialing: 6,
  canceling: 5,
  past_due: 4,
  unresolved: 3,
  canceled: 2,
  expired: 1,
};

const PAYMENT_STATUS_PRIORITY: Record<string, number> = {
  paid: 5,
  open: 4,
  pending: 3,
  failed: 2,
  void: 1,
};

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

const getMembershipPriority = (membership: Membership | null): number =>
  MEMBERSHIP_STATUS_PRIORITY[membership?.status ?? ""] ?? 0;

const getPaymentPriority = (payment: Payment | null): number =>
  PAYMENT_STATUS_PRIORITY[payment?.status ?? ""] ?? 0;

const pickPreferredMembership = (
  primary: Membership | null,
  fallback: Membership | null
): Membership | null => {
  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  const priorityDelta =
    getMembershipPriority(fallback) - getMembershipPriority(primary);
  if (priorityDelta !== 0) {
    return priorityDelta > 0 ? fallback : primary;
  }

  const fallbackRenewal = toDate(fallback.renewal_period_end)?.getTime() ?? 0;
  const primaryRenewal = toDate(primary.renewal_period_end)?.getTime() ?? 0;
  if (fallbackRenewal !== primaryRenewal) {
    return fallbackRenewal > primaryRenewal ? fallback : primary;
  }

  return primary;
};

const pickPreferredPayment = (
  primary: Payment | null,
  fallback: Payment | null,
  preferredMembershipId: string | null
): Payment | null => {
  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  const membershipMatchDelta =
    Number((fallback.membership?.id ?? null) === preferredMembershipId) -
    Number((primary.membership?.id ?? null) === preferredMembershipId);
  if (membershipMatchDelta !== 0) {
    return membershipMatchDelta > 0 ? fallback : primary;
  }

  const priorityDelta = getPaymentPriority(fallback) - getPaymentPriority(primary);
  if (priorityDelta !== 0) {
    return priorityDelta > 0 ? fallback : primary;
  }

  const fallbackPaidAt = toDate(fallback.paid_at)?.getTime() ?? 0;
  const primaryPaidAt = toDate(primary.paid_at)?.getTime() ?? 0;
  if (fallbackPaidAt !== primaryPaidAt) {
    return fallbackPaidAt > primaryPaidAt ? fallback : primary;
  }

  return primary;
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
  const [storedMembership, storedPayment, storedInvoice] = await Promise.all([
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

  const shouldRecoverFromWhop =
    !storedMembership ||
    !storedPayment ||
    !user.whopMemberId ||
    !user.whopMembershipId ||
    !user.whopPaymentMethodId ||
    !user.subscriptionPlanKey;

  const recovered = shouldRecoverFromWhop
    ? await recoverWhopBillingStateByEmail(user.email).catch(() => null)
    : null;

  const membership = pickPreferredMembership(
    storedMembership,
    recovered?.membership ?? null
  );
  const payment = pickPreferredPayment(
    storedPayment,
    recovered?.payment ?? null,
    membership?.id ?? storedMembership?.id ?? recovered?.membership?.id ?? null
  );
  const invoice = storedInvoice ?? recovered?.invoice ?? null;

  const memberId =
    membership?.member?.id ??
    payment?.member?.id ??
    recovered?.memberId ??
    user.whopMemberId ??
    null;
  const paymentMethodId =
    payment?.payment_method?.id ??
    recovered?.paymentMethodId ??
    user.whopPaymentMethodId ??
    null;
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
