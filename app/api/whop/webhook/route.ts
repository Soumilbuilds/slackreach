import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getPlanForProductId, getPlanForStoredKey, getPlanForWhopPlanId } from "@/lib/plans";
import {
  sendLeadConnectorPlanPaidWebhook,
  sendLeadConnectorTrialStartedWebhook,
} from "@/lib/leadconnector";
import {
  cancelWhopMembership,
  isWhopReady,
  readBillingMetadata,
  unwrapWhopWebhook,
  voidWhopPayment,
} from "@/lib/whop";
import { WHOP_PLAN_ID_STARTER } from "@/lib/whop-config";
import type { SetupIntent } from "@whop/sdk/resources/setup-intents";
import type { Invoice, Membership, Payment } from "@whop/sdk/resources/shared";

const ACCESS_ALLOWED_STATUSES = new Set(["active", "trialing", "canceling"]);

const BILLING_USER_SELECT = {
  id: true,
  email: true,
  whopMemberId: true,
  whopMembershipId: true,
  whopMembershipStatus: true,
  whopPlanId: true,
  whopProductId: true,
  whopPaymentMethodId: true,
  whopLastPaymentId: true,
  whopLastInvoiceId: true,
  leadConnectorTrialStartedAt: true,
  leadConnectorTrialStartedPaymentId: true,
  leadConnectorPlanPaidAt: true,
  leadConnectorPlanPaidPaymentId: true,
  subscriptionPlanKey: true,
} as const;

const LEADCONNECTOR_PLAN_PAID_ACTIONS = new Set([
  "plan_change",
  "account_limit_upgrade",
  "recover",
]);

type BillingUser = Awaited<
  ReturnType<typeof prisma.user.findFirst<{ select: typeof BILLING_USER_SELECT }>>
>;
type ResolvedBillingUser = NonNullable<BillingUser>;

const normalizeEmail = (value: string | null | undefined): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  return email.length > 0 ? email : null;
};

const toDate = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseUserId = (value: string | undefined): number | null => {
  if (!value) {
    return null;
  }

  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const findBillingUser = async (params: {
  metadata?: Record<string, unknown> | null;
  email?: string | null;
  membershipId?: string | null;
  memberId?: string | null;
}): Promise<BillingUser> => {
  const metadata = readBillingMetadata(params.metadata);
  const metadataUserId = parseUserId(metadata.slackreach_user_id);
  const email = normalizeEmail(params.email ?? metadata.slackreach_user_email ?? null);

  if (metadataUserId) {
    const byId = await prisma.user.findUnique({
      where: { id: metadataUserId },
      select: BILLING_USER_SELECT,
    });
    if (byId) {
      return byId;
    }
  }

  if (params.membershipId) {
    const byMembership = await prisma.user.findFirst({
      where: { whopMembershipId: params.membershipId },
      select: BILLING_USER_SELECT,
    });
    if (byMembership) {
      return byMembership;
    }
  }

  if (params.memberId) {
    const byMember = await prisma.user.findFirst({
      where: { whopMemberId: params.memberId },
      select: BILLING_USER_SELECT,
    });
    if (byMember) {
      return byMember;
    }
  }

  if (email) {
    const byEmail = await prisma.user.findFirst({
      where: { email },
      select: BILLING_USER_SELECT,
    });
    if (byEmail) {
      return byEmail;
    }
  }

  return null;
};

const resolvePlanKey = (
  whopPlanId: string | null | undefined,
  whopProductId: string | null | undefined,
  storedPlanKey: string | null | undefined
): string | null =>
  getPlanForWhopPlanId(whopPlanId)?.key ??
  getPlanForProductId(whopProductId)?.key ??
  getPlanForStoredKey(storedPlanKey)?.key ??
  null;

const shouldApplyMembershipUpdate = (
  user: ResolvedBillingUser,
  membership: Membership
): boolean => {
  const incomingIsActive = ACCESS_ALLOWED_STATUSES.has(membership.status);
  const currentIsActive = ACCESS_ALLOWED_STATUSES.has(
    user?.whopMembershipStatus ?? ""
  );

  if (incomingIsActive) {
    return true;
  }

  if (!user?.whopMembershipId) {
    return true;
  }

  if (user.whopMembershipId === membership.id) {
    return true;
  }

  return !currentIsActive;
};

const applyMembershipUpdate = async (
  user: ResolvedBillingUser,
  membership: Membership
): Promise<void> => {
  if (!shouldApplyMembershipUpdate(user, membership)) {
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      whopMemberId: membership.member?.id ?? user.whopMemberId,
      whopMembershipId: membership.id,
      whopMembershipStatus: membership.status,
      whopRenewalPeriodEnd: toDate(membership.renewal_period_end),
      whopCancelAtPeriodEnd: membership.cancel_at_period_end,
      whopPlanId: membership.plan.id,
      whopProductId: membership.product.id,
      subscriptionPlanKey: resolvePlanKey(
        membership.plan.id,
        membership.product.id,
        user.subscriptionPlanKey
      ),
    },
  });
};

const applyPaymentUpdate = async (
  user: ResolvedBillingUser,
  payment: Payment
): Promise<void> => {
  const shouldUpdateMembership =
    !user.whopMembershipId || user.whopMembershipId === payment.membership?.id;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      whopMemberId: payment.member?.id ?? user.whopMemberId,
      whopPaymentMethodId:
        payment.payment_method?.id ?? user.whopPaymentMethodId,
      whopLastPaymentId: payment.id,
      whopLastPaymentStatus: payment.status,
      whopLastPaymentSubstatus: payment.substatus,
      ...(shouldUpdateMembership && payment.membership
        ? {
            whopMembershipId: payment.membership.id,
            whopMembershipStatus: payment.membership.status,
          }
        : {}),
      ...(payment.plan?.id
        ? {
            whopPlanId: payment.plan.id,
            subscriptionPlanKey: resolvePlanKey(
              payment.plan.id,
              payment.product?.id ?? user.whopProductId,
              user.subscriptionPlanKey
            ),
          }
        : {}),
      ...(payment.product?.id ? { whopProductId: payment.product.id } : {}),
    },
  });
};

const applyInvoiceUpdate = async (
  user: ResolvedBillingUser,
  invoice: Invoice
): Promise<void> => {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      whopLastInvoiceId: invoice.id,
      whopLastInvoiceStatus: invoice.status,
      whopLastInvoiceToken: invoice.fetch_invoice_token,
    },
  });
};

const applySetupIntentUpdate = async (
  user: ResolvedBillingUser,
  setupIntent: SetupIntent
): Promise<void> => {
  await prisma.user.update({
    where: { id: user.id },
    data: {
      whopMemberId: setupIntent.member?.id ?? user.whopMemberId,
      whopPaymentMethodId:
        setupIntent.payment_method?.id ?? user.whopPaymentMethodId,
    },
  });
};

const maybeCancelPreviousMembership = async (
  metadata: ReturnType<typeof readBillingMetadata>,
  currentMembershipId: string
): Promise<void> => {
  const previousMembershipId = metadata.slackreach_previous_membership_id;
  if (!previousMembershipId || previousMembershipId === currentMembershipId) {
    return;
  }

  await cancelWhopMembership(previousMembershipId, "immediate").catch(() => undefined);
};

const maybeVoidPreviousPayment = async (
  metadata: ReturnType<typeof readBillingMetadata>,
  currentPaymentId: string
): Promise<void> => {
  const previousPaymentId = metadata.slackreach_previous_payment_id;
  if (!previousPaymentId || previousPaymentId === currentPaymentId) {
    return;
  }

  await voidWhopPayment(previousPaymentId).catch(() => undefined);
};

const maybeSendLeadConnectorTrialStarted = async (
  user: ResolvedBillingUser,
  payment: Payment
): Promise<void> => {
  const metadata = readBillingMetadata(payment.metadata);
  const isStarterTrialSignup =
    metadata.slackreach_action === "signup" &&
    metadata.slackreach_plan_key === "starter" &&
    payment.plan?.id === WHOP_PLAN_ID_STARTER;

  if (!isStarterTrialSignup) {
    return;
  }

  if (
    user.leadConnectorTrialStartedAt ||
    user.leadConnectorTrialStartedPaymentId === payment.id
  ) {
    return;
  }

  const email = payment.user?.email ?? user.email;
  if (!email) {
    throw new Error("LeadConnector trial started webhook is missing an email.");
  }

  await sendLeadConnectorTrialStartedWebhook({
    name: payment.billing_address?.name?.trim() ?? "",
    email,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      leadConnectorTrialStartedAt: new Date(),
      leadConnectorTrialStartedPaymentId: payment.id,
    },
  });
};

const maybeSendLeadConnectorPlanPaid = async (
  user: ResolvedBillingUser,
  payment: Payment
): Promise<void> => {
  if (payment.status !== "paid" || payment.substatus !== "succeeded") {
    return;
  }

  if (user.leadConnectorPlanPaidPaymentId === payment.id) {
    return;
  }

  const planKey = resolvePlanKey(
    payment.plan?.id,
    payment.product?.id,
    user.subscriptionPlanKey
  );
  if (planKey !== "starter" && planKey !== "growth" && planKey !== "unlimited") {
    return;
  }

  const metadata = readBillingMetadata(payment.metadata);
  const action = metadata.slackreach_action;
  const isExplicitUpgradeOrRecovery = action
    ? LEADCONNECTOR_PLAN_PAID_ACTIONS.has(action)
    : false;
  const amountPaid = payment.total ?? payment.subtotal ?? 0;
  const isFirstPaidStarterConversion =
    !user.leadConnectorPlanPaidAt &&
    planKey === "starter" &&
    amountPaid > 0 &&
    (payment.billing_reason === "subscription_cycle" ||
      payment.billing_reason === "subscription_create" ||
      payment.billing_reason === "subscription");

  if (!isExplicitUpgradeOrRecovery && !isFirstPaidStarterConversion) {
    return;
  }

  const email = payment.user?.email ?? user.email;
  if (!email) {
    throw new Error("LeadConnector plan paid webhook is missing an email.");
  }

  await sendLeadConnectorPlanPaidWebhook({
    email,
    plan: planKey,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      leadConnectorPlanPaidAt: new Date(),
      leadConnectorPlanPaidPaymentId: payment.id,
    },
  });
};

export async function POST(request: NextRequest) {
  if (!isWhopReady()) {
    return NextResponse.json(
      { error: "Whop billing is not configured yet." },
      { status: 503 }
    );
  }

  const body = await request.text();
  const headers = Object.fromEntries(request.headers.entries());

  let event;
  try {
    event = unwrapWhopWebhook(body, headers);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  switch (event.type) {
    case "setup_intent.succeeded": {
      const user = await findBillingUser({
        metadata: event.data.metadata,
        email: event.data.member?.user?.email,
        memberId: event.data.member?.id,
      });

      if (user) {
        await applySetupIntentUpdate(user, event.data);
      }
      break;
    }

    case "membership.activated":
    case "membership.deactivated":
    case "membership.cancel_at_period_end_changed": {
      const metadata = readBillingMetadata(event.data.metadata);
      const user = await findBillingUser({
        metadata: event.data.metadata,
        email: event.data.user?.email,
        membershipId: event.data.id,
        memberId: event.data.member?.id,
      });

      if (user) {
        await applyMembershipUpdate(user, event.data);
      }

      if (event.type === "membership.activated") {
        await maybeCancelPreviousMembership(metadata, event.data.id);
      }
      break;
    }

    case "payment.created":
    case "payment.succeeded":
    case "payment.failed":
    case "payment.pending": {
      const metadata = readBillingMetadata(event.data.metadata);
      const user = await findBillingUser({
        metadata: event.data.metadata,
        email: event.data.user?.email,
        membershipId: event.data.membership?.id,
        memberId: event.data.member?.id,
      });

      if (user) {
        await applyPaymentUpdate(user, event.data);
      }

      if (event.type === "payment.succeeded") {
        await maybeCancelPreviousMembership(
          metadata,
          event.data.membership?.id ?? ""
        );
        await maybeVoidPreviousPayment(metadata, event.data.id);
        if (user) {
          await maybeSendLeadConnectorTrialStarted(user, event.data);
          await maybeSendLeadConnectorPlanPaid(user, event.data);
        }
      }
      break;
    }

    case "invoice.created":
    case "invoice.paid":
    case "invoice.past_due":
    case "invoice.voided": {
      const user = await findBillingUser({
        email: event.data.email_address,
      });

      if (user) {
        await applyInvoiceUpdate(user, event.data);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
