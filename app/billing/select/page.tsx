import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { resolveBillingGate, syncUserBillingState } from "@/lib/billing";
import BillingSelectClient from "./BillingSelectClient";
import type { Payment } from "@whop/sdk/resources/shared";

type SearchParams = Promise<{ intent?: string; plan?: string }>;

type BillingAddress = {
  name: string;
  country: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};

const isAllowedIntent = (value: string | undefined): boolean =>
  value === "plan_change" ||
  value === "recover" ||
  value === "account_limit_upgrade";

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

export default async function BillingSelectPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect("/access?next=/billing/select");
  }

  const { intent } = await searchParams;
  const gate = await resolveBillingGate(user);

  if (gate.shouldAllowAccess && !isAllowedIntent(intent)) {
    redirect("/accounts");
  }

  if (
    !gate.shouldAllowAccess &&
    gate.redirectUrl &&
    gate.redirectUrl !== "/billing/select" &&
    !(gate.redirectUrl === "/billing/blocked" && intent === "recover")
  ) {
    redirect(gate.redirectUrl);
  }

  const billing = await syncUserBillingState(user);

  return (
    <BillingSelectClient
      email={user.email}
      billingAddress={toBillingAddressPrefill(billing.payment?.billing_address)}
    />
  );
}
