"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import WhopEmbeddedCheckoutCard from "@/components/billing/WhopEmbeddedCheckoutCard";

type BillingAddress = {
  name: string;
  country: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};

type Plan = {
  key: "starter" | "growth" | "unlimited";
  name: string;
  monthlyPriceUsd: number;
  accountLimit: number | null;
};

type BillingStatus = {
  membershipStatus: string | null;
};

const ACCESS_ALLOWED_STATUSES = new Set(["active", "trialing", "canceling"]);

const parseError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function RedeemClient({
  email,
  currentPlanKey,
  currentMembershipStatus,
  billingAddress,
  plans,
}: {
  email: string;
  currentPlanKey: "starter" | "growth" | "unlimited" | null;
  currentMembershipStatus: string | null;
  billingAddress?: BillingAddress | null;
  plans: Plan[];
}) {
  const router = useRouter();
  const [selectedPlanKey, setSelectedPlanKey] = useState<Plan["key"]>(
    currentPlanKey ?? "starter"
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canRedeemCurrentStarterTrial =
    currentPlanKey === "starter" && currentMembershipStatus === "trialing";

  const canOpenCheckout = useMemo(() => {
    if (!currentPlanKey) {
      return true;
    }

    if (selectedPlanKey !== currentPlanKey) {
      return true;
    }

    return canRedeemCurrentStarterTrial;
  }, [canRedeemCurrentStarterTrial, currentPlanKey, selectedPlanKey]);

  const waitForActivation = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage("");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const response = await fetch("/api/billing/status", {
          cache: "no-store",
        });

        if (response.ok) {
          const data = (await response.json()) as BillingStatus;
          if (
            data.membershipStatus &&
            ACCESS_ALLOWED_STATUSES.has(data.membershipStatus)
          ) {
            router.replace("/accounts");
            router.refresh();
            return;
          }
        }
      } catch {
        // ignore transient polling errors
      }

      await sleep(1500);
    }

    setSubmitting(false);
    setErrorMessage(
      "Payment was submitted. We are still waiting for confirmation. Refresh this page in a few seconds."
    );
  }, [router]);

  const loadCheckoutSession = useCallback(async () => {
    if (!canOpenCheckout) {
      setSessionId(null);
      setSessionLoading(false);
      setErrorMessage("");
      return;
    }

    setSessionLoading(true);
    setErrorMessage("");
    setSessionId(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: selectedPlanKey, intent: "redeem" }),
      });

      if (!response.ok) {
        setErrorMessage(await parseError(response));
        return;
      }

      const payload = (await response.json()) as { sessionId?: string };
      if (!payload.sessionId) {
        setErrorMessage("Checkout session could not be created.");
        return;
      }

      setSessionId(payload.sessionId);
    } catch {
      setErrorMessage("Unable to start checkout right now.");
    } finally {
      setSessionLoading(false);
    }
  }, [canOpenCheckout, selectedPlanKey]);

  useEffect(() => {
    void loadCheckoutSession();
  }, [loadCheckoutSession]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Redeem Your Coupon
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Choose your plan, apply your coupon in checkout, and confirm your subscription.
          </p>
        </div>

        <div className="mb-8 grid gap-3 md:grid-cols-3">
          {plans.map((plan) => {
            const isSelected = selectedPlanKey === plan.key;

            return (
              <button
                key={plan.key}
                type="button"
                onClick={() => setSelectedPlanKey(plan.key)}
                className={`flex min-h-[96px] items-center justify-center rounded-xl border bg-white px-6 py-5 transition-colors ${
                  isSelected
                    ? "border-gray-900 shadow-sm"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <span className="text-lg font-semibold tracking-tight text-gray-900">
                  {plan.name}
                </span>
              </button>
            );
          })}
        </div>

        {!canOpenCheckout && (
          <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Your current plan is already active. Choose a different plan to continue.
          </div>
        )}

        {errorMessage && (
          <div className="mx-auto mb-6 max-w-2xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mx-auto max-w-2xl">
          {!canOpenCheckout ? (
            <div className="flex min-h-[320px] items-center justify-center rounded-lg border border-gray-200 bg-white px-6">
              <p className="max-w-md text-center text-sm text-gray-500">
                Choose a different plan to continue. Starter can be selected here only
                while you are still on the trial and want to start the paid Starter
                subscription with a coupon.
              </p>
            </div>
          ) : sessionLoading || !sessionId ? (
            <div className="flex min-h-[500px] items-center justify-center rounded-lg border border-gray-200 bg-white">
              <div className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
                <p className="mt-3 text-sm text-gray-500">
                  Preparing checkout...
                </p>
              </div>
            </div>
          ) : (
            <WhopEmbeddedCheckoutCard
              sessionId={sessionId}
              email={email}
              billingAddress={billingAddress}
              onComplete={() => {
                void waitForActivation();
              }}
            />
          )}

          {submitting && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Payment submitted. Confirming your access...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
