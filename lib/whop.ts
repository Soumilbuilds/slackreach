import Whop from "@whop/sdk";
import type { SetupIntent } from "@whop/sdk/resources/setup-intents";
import type { UnwrapWebhookEvent } from "@whop/sdk/resources/webhooks";
import type { Invoice, Membership, Payment } from "@whop/sdk/resources/shared";
import {
  APP_BASE_URL,
  WHOP_API_KEY,
  WHOP_COMPANY_ID,
  WHOP_WEBHOOK_SECRET,
} from "@/lib/whop-config";
import { areBillingPlansConfigured, type PlanKey } from "@/lib/plans";

type CheckoutAction =
  | "signup"
  | "recover"
  | "plan_change"
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

const isConfiguredValue = (value: string): boolean =>
  Boolean(value.trim()) && !value.startsWith("REPLACE_WITH_");

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
    whopClient = new Whop({ apiKey: WHOP_API_KEY });
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

export const unwrapWhopWebhook = (
  body: string,
  headers: Record<string, string>
): UnwrapWebhookEvent =>
  getWhopClient().webhooks.unwrap(body, {
    headers,
    key: WHOP_WEBHOOK_SECRET || undefined,
  });
