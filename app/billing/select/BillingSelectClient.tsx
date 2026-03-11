"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

type PlanFeature = {
  label: string;
  included: boolean;
};

type Plan = {
  key: string;
  name: string;
  monthlyPriceUsd: number;
  accountLimit: number | null;
  trialDays: number;
  features: PlanFeature[];
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

export default function BillingSelectClient({
  email,
  billingAddress,
}: {
  email: string;
  billingAddress?: BillingAddress | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedPlanKey = useMemo(() => {
    const raw = searchParams.get("plan");
    if (raw === "starter" || raw === "growth" || raw === "unlimited") {
      return raw;
    }

    return null;
  }, [searchParams]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>(
    requestedPlanKey ?? "starter"
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const intent = useMemo(() => {
    const raw = searchParams.get("intent");
    if (
      raw === "plan_change" ||
      raw === "recover" ||
      raw === "account_limit_upgrade"
    ) {
      return raw;
    }

    return "signup";
  }, [searchParams]);

  useEffect(() => {
    if (
      (intent === "plan_change" || intent === "account_limit_upgrade") &&
      requestedPlanKey
    ) {
      setSelectedPlanKey(requestedPlanKey);
    }
  }, [intent, requestedPlanKey]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/plans")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setPlans(data.plans ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("Unable to load billing plans right now.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPlansLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
          if (data.membershipStatus && ACCESS_ALLOWED_STATUSES.has(data.membershipStatus)) {
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

  const loadCheckoutSession = useCallback(
    async (planKey: string) => {
      setSessionLoading(true);
      setErrorMessage("");
      setSessionId(null);

      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey, intent }),
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
    },
    [intent]
  );

  useEffect(() => {
    if (!selectedPlanKey) {
      return;
    }

    void loadCheckoutSession(selectedPlanKey);
  }, [loadCheckoutSession, selectedPlanKey]);

  const headingText =
    intent === "plan_change"
      ? "Change Plan"
      : intent === "account_limit_upgrade"
        ? "Upgrade Plan"
        : intent === "recover"
          ? "Resume Access"
          : "Start Your Trial";

  const descriptionText =
    intent === "signup"
      ? "Free For 7 Days | Cancel Anytime"
      : intent === "plan_change"
        ? "Complete payment below to switch to your selected plan."
        : intent === "recover"
          ? "Complete payment below to restore your access."
          : "Upgrade to a higher plan to unlock more accounts.";

  const showPlanSelection =
    intent !== "signup" &&
    !(
      (intent === "plan_change" || intent === "account_limit_upgrade") &&
      requestedPlanKey
    );
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            {headingText}
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            {descriptionText}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Signed in as {email}
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className={showPlanSelection ? "grid gap-6 lg:grid-cols-[1fr_1.2fr]" : "max-w-lg mx-auto"}>
          {/* Plan selection — only for plan_change / upgrade / recover */}
          {showPlanSelection && (
            <div className="space-y-3">
              {plans.map((plan) => {
                const isSelected = plan.key === selectedPlanKey;
                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlanKey(plan.key)}
                    className={`w-full rounded-lg border p-5 text-left transition-colors ${
                      isSelected
                        ? "border-gray-900 bg-white shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className={`text-sm font-semibold ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
                          {plan.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {plan.accountLimit == null
                            ? "Unlimited accounts"
                            : `${plan.accountLimit} account${plan.accountLimit === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-semibold ${isSelected ? "text-gray-900" : "text-gray-700"}`}>
                          ${plan.monthlyPriceUsd}
                        </p>
                        <p className="text-xs text-gray-400">/month</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Checkout embed */}
          <div>
            {sessionLoading || !sessionId ? (
              <div className="flex h-full min-h-[500px] items-center justify-center rounded-lg border border-gray-200 bg-white">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
                  <p className="mt-3 text-sm text-gray-500">
                    {plansLoading ? "Loading plans..." : "Preparing checkout..."}
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
    </div>
  );
}
