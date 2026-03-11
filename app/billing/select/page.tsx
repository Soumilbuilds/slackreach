import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { resolveBillingGate } from "@/lib/billing";
import BillingSelectClient from "./BillingSelectClient";

type SearchParams = Promise<{ intent?: string }>;

const isAllowedIntent = (value: string | undefined): boolean =>
  value === "plan_change" ||
  value === "recover" ||
  value === "account_limit_upgrade";

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

  return <BillingSelectClient email={user.email} />;
}
