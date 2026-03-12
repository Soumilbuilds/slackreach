import { redirect } from "next/navigation";
import type { Payment } from "@whop/sdk/resources/shared";
import { BILLING_PLANS } from "@/lib/plans";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import RedeemClient from "./RedeemClient";

type BillingAddress = {
  name: string;
  country: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};

const ACCESS_ALLOWED_STATUSES = new Set(["active", "trialing", "canceling"]);

const toBillingAddressPrefill = (
  billingAddress: Payment["billing_address"] | null | undefined
): BillingAddress | null => {
  if (
    !billingAddress?.name ||
    !billingAddress.country ||
    !billingAddress.line1 ||
    !billingAddress.city ||
    !billingAddress.state ||
    !billingAddress.postal_code
  ) {
    return null;
  }

  return {
    name: billingAddress.name,
    country: billingAddress.country,
    line1: billingAddress.line1,
    line2: billingAddress.line2 ?? undefined,
    city: billingAddress.city,
    state: billingAddress.state,
    postalCode: billingAddress.postal_code,
  };
};

export default async function RedeemPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/access?next=/redeem");
  }

  const billing = await syncUserBillingState(user);

  if (
    !billing.membershipStatus ||
    !ACCESS_ALLOWED_STATUSES.has(billing.membershipStatus)
  ) {
    redirect("/accounts");
  }

  return (
    <RedeemClient
      email={user.email}
      currentPlanKey={billing.planKey}
      currentMembershipStatus={billing.membershipStatus}
      billingAddress={toBillingAddressPrefill(billing.payment?.billing_address)}
      plans={BILLING_PLANS.map((plan) => ({
        key: plan.key,
        name: plan.name,
        monthlyPriceUsd: plan.monthlyPriceUsd,
        accountLimit: plan.accountLimit,
      }))}
    />
  );
}
