import Whop from "@whop/sdk";
import type { MembershipListResponse } from "@whop/sdk/resources/memberships";
import type { PaymentListResponse } from "@whop/sdk/resources/payments";
import type { SetupIntent } from "@whop/sdk/resources/setup-intents";
import type { UnwrapWebhookEvent } from "@whop/sdk/resources/webhooks";
import type { Invoice, Membership, Payment } from "@whop/sdk/resources/shared";
import {
  APP_BASE_URL,
  WHOP_API_KEY,
  WHOP_COMPANY_ID,
  WHOP_PRODUCT_ID,
  WHOP_WEBHOOK_SECRET,
} from "@/lib/whop-config";
import { areBillingPlansConfigured, type PlanKey } from "@/lib/plans";

type CheckoutAction =
  | "signup"
  | "recover"
  | "plan_change"
  | "redeem"
  | "account_limit_upgrade";

type BillingMetadata = {
  slackreach_user_id: string;
  slackreach_user_email: string;
  slackreach_plan_key: PlanKey;
  slackreach_action: CheckoutAction;
  slackreach_previous_membership_id?: string;
  slackreach_previous_payment_id?: string;
};

let whopClient: Whop | null = null;

const BILLING_MEMBERSHIP_STATUS_PRIORITY: Record<string, number> = {
  active: 7,
  trialing: 6,
  canceling: 5,
  past_due: 4,
  unresolved: 3,
  canceled: 2,
  expired: 1,
};

const BILLING_PAYMENT_STATUS_PRIORITY: Record<string, number> = {
  paid: 5,
  open: 4,
  pending: 3,
  failed: 2,
  void: 1,
};

const isConfiguredValue = (value: string): boolean =>
  Boolean(value.trim()) && !value.startsWith("REPLACE_WITH_");

const encodeWhopWebhookKey = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64");

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const toTimestamp = (value: string | null | undefined): number => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
};

const getMembershipPriority = (status: string | null | undefined): number =>
  BILLING_MEMBERSHIP_STATUS_PRIORITY[status ?? ""] ?? 0;

const getPaymentPriority = (status: string | null | undefined): number =>
  BILLING_PAYMENT_STATUS_PRIORITY[status ?? ""] ?? 0;

const pickBestMembershipSummary = (
  memberships: MembershipListResponse[]
): MembershipListResponse | null =>
  [...memberships].sort((left, right) => {
    const priorityDelta =
      getMembershipPriority(right.status) - getMembershipPriority(left.status);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return toTimestamp(right.created_at) - toTimestamp(left.created_at);
  })[0] ?? null;

const pickBestPaymentSummary = (
  payments: PaymentListResponse[],
  membershipId: string | null
): PaymentListResponse | null =>
  [...payments].sort((left, right) => {
    const membershipMatchDelta =
      Number((right.membership?.id ?? null) === membershipId) -
      Number((left.membership?.id ?? null) === membershipId);
    if (membershipMatchDelta !== 0) {
      return membershipMatchDelta;
    }

    const priorityDelta =
      getPaymentPriority(right.status) - getPaymentPriority(left.status);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const paidAtDelta = toTimestamp(right.paid_at) - toTimestamp(left.paid_at);
    if (paidAtDelta !== 0) {
      return paidAtDelta;
    }

    return toTimestamp(right.created_at) - toTimestamp(left.created_at);
  })[0] ?? null;

const hasUsableAppBaseUrl = (): boolean => {
  if (!isConfiguredValue(APP_BASE_URL)) {
    return false;
  }

  try {
    const url = new URL(APP_BASE_URL);

    if (process.env.NODE_ENV === "production") {
      return url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
    }

    return true;
  } catch {
    return false;
  }
};

export const isWhopReady = (): boolean =>
  isConfiguredValue(WHOP_API_KEY) &&
  isConfiguredValue(WHOP_COMPANY_ID) &&
  isConfiguredValue(WHOP_WEBHOOK_SECRET) &&
  hasUsableAppBaseUrl() &&
  areBillingPlansConfigured();

const getWhopClient = (): Whop => {
  if (!isWhopReady()) {
    throw new Error(
      "Whop billing is not configured. Set WHOP_API_KEY, WHOP_COMPANY_ID, WHOP_WEBHOOK_SECRET, and APP_BASE_URL."
    );
  }

  if (!whopClient) {
    whopClient = new Whop({
      apiKey: WHOP_API_KEY,
      webhookKey: encodeWhopWebhookKey(WHOP_WEBHOOK_SECRET),
    });
  }

  return whopClient;
};

export const buildBillingMetadata = (params: {
  userId: number;
  email: string;
  planKey: PlanKey;
  action: CheckoutAction;
  previousMembershipId?: string | null;
  previousPaymentId?: string | null;
}): BillingMetadata => ({
  slackreach_user_id: String(params.userId),
  slackreach_user_email: params.email,
  slackreach_plan_key: params.planKey,
  slackreach_action: params.action,
  ...(params.previousMembershipId
    ? { slackreach_previous_membership_id: params.previousMembershipId }
    : {}),
  ...(params.previousPaymentId
    ? { slackreach_previous_payment_id: params.previousPaymentId }
    : {}),
});

export const readBillingMetadata = (
  metadata: Record<string, unknown> | null | undefined
): Partial<BillingMetadata> => ({
  slackreach_user_id:
    typeof metadata?.slackreach_user_id === "string"
      ? metadata.slackreach_user_id
      : undefined,
  slackreach_user_email:
    typeof metadata?.slackreach_user_email === "string"
      ? metadata.slackreach_user_email
      : undefined,
  slackreach_plan_key:
    typeof metadata?.slackreach_plan_key === "string"
      ? (metadata.slackreach_plan_key as PlanKey)
      : undefined,
  slackreach_action:
    typeof metadata?.slackreach_action === "string"
      ? (metadata.slackreach_action as CheckoutAction)
      : undefined,
  slackreach_previous_membership_id:
    typeof metadata?.slackreach_previous_membership_id === "string"
      ? metadata.slackreach_previous_membership_id
      : undefined,
  slackreach_previous_payment_id:
    typeof metadata?.slackreach_previous_payment_id === "string"
      ? metadata.slackreach_previous_payment_id
      : undefined,
});

export const createWhopCheckoutSession = async (params: {
  planId: string;
  metadata: BillingMetadata;
  returnPath?: string;
}): Promise<{ id: string; purchaseUrl: string }> => {
  const client = getWhopClient();
  const checkout = await client.checkoutConfigurations.create({
    plan_id: params.planId,
    metadata: params.metadata,
    redirect_url: `${APP_BASE_URL}${params.returnPath ?? "/billing/return"}`,
    source_url: `${APP_BASE_URL}/billing/select`,
  });

  return {
    id: checkout.id,
    purchaseUrl: checkout.purchase_url,
  };
};

export const retrieveWhopMembership = async (
  membershipId: string
): Promise<Membership> => getWhopClient().memberships.retrieve(membershipId);

export const cancelWhopMembership = async (
  membershipId: string,
  cancellationMode: "immediate" | "at_period_end" = "immediate"
): Promise<Membership> =>
  getWhopClient().memberships.cancel(membershipId, {
    cancellation_mode: cancellationMode,
  });

export const retrieveWhopPayment = async (paymentId: string): Promise<Payment> =>
  getWhopClient().payments.retrieve(paymentId);

export const retryWhopPayment = async (paymentId: string): Promise<Payment> =>
  getWhopClient().payments.retry(paymentId);

export const voidWhopPayment = async (paymentId: string): Promise<Payment> =>
  getWhopClient().payments.void(paymentId);

export const chargeWhopMemberForPlan = async (params: {
  memberId: string;
  paymentMethodId: string;
  planId: string;
  metadata: BillingMetadata;
}): Promise<Payment> =>
  getWhopClient().payments.create({
    company_id: WHOP_COMPANY_ID,
    member_id: params.memberId,
    payment_method_id: params.paymentMethodId,
    plan_id: params.planId,
    metadata: params.metadata,
  });

export const retrieveWhopInvoice = async (invoiceId: string): Promise<Invoice> =>
  getWhopClient().invoices.retrieve(invoiceId);

export const retrieveWhopSetupIntent = async (
  setupIntentId: string
): Promise<SetupIntent> => getWhopClient().setupIntents.retrieve(setupIntentId);

export const recoverWhopBillingStateByEmail = async (
  email: string
): Promise<{
  memberId: string | null;
  membership: Membership | null;
  payment: Payment | null;
  invoice: Invoice | null;
  paymentMethodId: string | null;
}> => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      memberId: null,
      membership: null,
      payment: null,
      invoice: null,
      paymentMethodId: null,
    };
  }

  const client = getWhopClient();
  const membersPage = await client.members.list({
    query: normalizedEmail,
    product_ids: [WHOP_PRODUCT_ID],
    first: 10,
  });

  const matchedMember =
    membersPage.data.find(
      (member) => normalizeEmail(member.user?.email ?? "") === normalizedEmail
    ) ?? null;

  const userId = matchedMember?.user?.id ?? null;
  const memberId = matchedMember?.id ?? null;

  const membershipsPage = userId
    ? await client.memberships.list({
        company_id: WHOP_COMPANY_ID,
        user_ids: [userId],
        product_ids: [WHOP_PRODUCT_ID],
        first: 10,
        order: "created_at",
        direction: "desc",
      })
    : null;

  const matchedMembershipSummary = pickBestMembershipSummary(
    membershipsPage?.data ?? []
  );

  let membership = matchedMembershipSummary
    ? await retrieveWhopMembership(matchedMembershipSummary.id).catch(() => null)
    : null;

  const paymentsPage = await client.payments.list({
    company_id: WHOP_COMPANY_ID,
    query: normalizedEmail,
    product_ids: [WHOP_PRODUCT_ID],
    include_free: true,
    first: 10,
    order: "created_at",
    direction: "desc",
  });

  const matchedPaymentSummary = pickBestPaymentSummary(
    paymentsPage.data,
    membership?.id ?? matchedMembershipSummary?.id ?? null
  );

  const payment = matchedPaymentSummary
    ? await retrieveWhopPayment(matchedPaymentSummary.id).catch(() => null)
    : null;

  if (!membership && payment?.membership?.id) {
    membership = await retrieveWhopMembership(payment.membership.id).catch(() => null);
  }

  return {
    memberId: membership?.member?.id ?? payment?.member?.id ?? memberId,
    membership,
    payment,
    invoice: null,
    paymentMethodId: payment?.payment_method?.id ?? null,
  };
};

export const unwrapWhopWebhook = (
  body: string,
  headers: Record<string, string>
): UnwrapWebhookEvent =>
  getWhopClient().webhooks.unwrap(body, { headers });
