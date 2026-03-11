"use client";

import { useCallback, useEffect, useState } from "react";
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
  planKey: "starter" | "growth" | "unlimited" | null;
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

export default function BillingBlockedClient({
  email,
  billingAddress,
}: {
  email: string;
  billingAddress?: BillingAddress | null;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState<
    "starter" | "growth" | "unlimited"
  >("starter");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      try {
        const [plansResponse, statusResponse] = await Promise.all([
          fetch("/api/plans", { cache: "no-store" }),
          fetch("/api/billing/status", { cache: "no-store" }),
        ]);

        if (!plansResponse.ok) {
          throw new Error("Unable to load billing plans right now.");
        }

        const plansData = (await plansResponse.json()) as { plans?: Plan[] };
        const loadedPlans = plansData.plans ?? [];

        if (!cancelled) {
          setPlans(loadedPlans);
        }

        if (statusResponse.ok) {
          const statusData = (await statusResponse.json()) as BillingStatus;

          if (
            statusData.membershipStatus &&
            ACCESS_ALLOWED_STATUSES.has(statusData.membershipStatus)
          ) {
            router.replace("/accounts");
            router.refresh();
            return;
          }

          if (
            !cancelled &&
            statusData.planKey &&
            (statusData.planKey === "starter" ||
              statusData.planKey === "growth" ||
              statusData.planKey === "unlimited")
          ) {
            setSelectedPlanKey(statusData.planKey);
          } else if (!cancelled && loadedPlans[0]?.key) {
            setSelectedPlanKey(loadedPlans[0].key);
          }
        } else if (!cancelled && loadedPlans[0]?.key) {
          setSelectedPlanKey(loadedPlans[0].key);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load billing details right now."
          );
        }
      } finally {
        if (!cancelled) {
          setPlansLoading(false);
        }
      }
    };

    void loadPageData();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const waitForRecovery = useCallback(async () => {
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

  const loadCheckoutSession = useCallback(async (planKey: Plan["key"]) => {
    setSessionLoading(true);
    setErrorMessage("");
    setSessionId(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, intent: "recover" }),
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
  }, []);

  useEffect(() => {
    void loadCheckoutSession(selectedPlanKey);
  }, [loadCheckoutSession, selectedPlanKey]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/access");
      router.refresh();
      setSigningOut(false);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            No Active Subscription Found
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Access SlackReach Again With A New Subscription
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => {
              const isSelected = plan.key === selectedPlanKey;

              return (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlanKey(plan.key)}
                  className={`rounded-xl border bg-white p-5 text-left transition-all ${
                    isSelected
                      ? "border-gray-900 shadow-sm ring-1 ring-gray-900/10"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-gray-900">
                        {plan.name}
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {plan.accountLimit == null
                          ? "Unlimited accounts"
                          : `${plan.accountLimit} account${plan.accountLimit === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold tracking-tight text-gray-900">
                        ${plan.monthlyPriceUsd}
                      </p>
                      <p className="text-xs text-gray-400">/month</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {sessionLoading || !sessionId ? (
            <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-gray-200 bg-white">
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
                void waitForRecovery();
              }}
            />
          )}

          {submitting && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Payment submitted. Confirming your access...
            </div>
          )}

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
              }}
              className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
              disabled={signingOut}
            >
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
