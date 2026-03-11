import { redirect } from "next/navigation";
import type { Payment } from "@whop/sdk/resources/shared";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { resolveBillingGate, syncUserBillingState } from "@/lib/billing";
import BillingBlockedClient from "./BillingBlockedClient";

type BillingAddress = {
  name: string;
  country: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};

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

export default async function BillingBlockedPage() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/access?next=/billing/blocked");
  }

  const gate = await resolveBillingGate(user);
  if (gate.shouldAllowAccess) {
    redirect("/accounts");
  }

  if (gate.redirectUrl && gate.redirectUrl !== "/billing/blocked") {
    redirect(gate.redirectUrl);
  }

  const billing = await syncUserBillingState(user);

  return (
    <BillingBlockedClient
      email={user.email}
      billingAddress={toBillingAddressPrefill(billing.payment?.billing_address)}
    />
  );
}
