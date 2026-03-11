"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WhopEmbeddedCheckoutCard from "@/components/billing/WhopEmbeddedCheckoutCard";

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
  paymentStatus: string | null;
  paymentSubstatus: string | null;
  paymentId: string | null;
  invoiceId: string | null;
  invoiceStatus: string | null;
  planKey: string | null;
  planName: string | null;
  canRetryPayment: boolean;
};

const ACCESS_ALLOWED_STATUSES = new Set(["active", "trialing", "canceling"]);

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function BillingBlockedClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [selectedPlanKey, setSelectedPlanKey] = useState("starter");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [retryLoading, setRetryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const waitForRecovery = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage("");

    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        if (response.ok) {
          const data = (await response.json()) as BillingStatus;
          if (data.membershipStatus && ACCESS_ALLOWED_STATUSES.has(data.membershipStatus)) {
            router.replace("/accounts");
            router.refresh();
            return;
          }
        }
      } catch {
        // ignore transient failures while polling
      }

      await sleep(1500);
    }

    setSubmitting(false);
    setErrorMessage(
      "Payment was submitted. Still waiting for confirmation. Refresh this page in a few seconds."
    );
  }, [router]);

  const loadCheckoutSession = useCallback(async (planKey: string) => {
    setSessionLoading(true);
    setSessionId(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, intent: "recover" }),
      });

      if (!response.ok) {
        setErrorMessage(await parseApiError(response));
        return;
      }

      const payload = (await response.json()) as { sessionId?: string };
      if (!payload.sessionId) {
        setErrorMessage("Checkout session could not be created.");
        return;
      }

      setSessionId(payload.sessionId);
    } catch {
      setErrorMessage("Unable to prepare recovery checkout right now.");
    } finally {
      setSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [meRes, plansRes, statusRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/plans"),
          fetch("/api/billing/status", { cache: "no-store" }),
        ]);

        if (!meRes.ok || !plansRes.ok || !statusRes.ok) {
          throw new Error("Failed to load billing data.");
        }

        const meData = await meRes.json();
        const plansData = await plansRes.json();
        const statusData = (await statusRes.json()) as BillingStatus;

        if (cancelled) {
          return;
        }

        setEmail(meData.user?.email ?? "");
        setPlans(plansData.plans ?? []);
        setBillingStatus(statusData);
        setSelectedPlanKey(statusData.planKey ?? "starter");

        if (statusData.membershipStatus && ACCESS_ALLOWED_STATUSES.has(statusData.membershipStatus)) {
          router.replace("/accounts");
          router.refresh();
          return;
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("Unable to load your billing status right now.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (loading || !selectedPlanKey) {
      return;
    }

    void loadCheckoutSession(selectedPlanKey);
  }, [loadCheckoutSession, loading, selectedPlanKey]);

  const handleRetryPayment = async () => {
    setRetryLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/billing/retry", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        if (payload.redirectUrl) {
          router.push(payload.redirectUrl);
          return;
        }
        setErrorMessage(payload.error || "Payment retry failed.");
        return;
      }

      if (payload.success || payload.pending) {
        void waitForRecovery();
        return;
      }

      if (payload.redirectUrl) {
        router.push(payload.redirectUrl);
        return;
      }

      setErrorMessage(payload.error || "Payment retry failed.");
    } catch {
      setErrorMessage("Payment retry failed.");
    } finally {
      setRetryLoading(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/access");
    } catch {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <p className="text-sm text-gray-500">Checking billing status...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Payment Required
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Your last payment needs attention. Retry your saved card or complete a fresh checkout to restore access.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {email}
          </p>
        </div>

        {/* Status pills */}
        {billingStatus && (
          <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
            {billingStatus.membershipStatus && (
              <span className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                Status: {billingStatus.membershipStatus}
              </span>
            )}
            {billingStatus.paymentStatus && (
              <span className="rounded-full bg-white border border-gray-200 px-3 py-1 text-xs text-gray-600">
                Payment: {billingStatus.paymentStatus}
              </span>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Retry button */}
        <div className="flex justify-center gap-3 mb-8">
          <button
            onClick={handleRetryPayment}
            disabled={!billingStatus?.canRetryPayment || retryLoading}
            className="px-5 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {retryLoading ? "Retrying..." : "Retry Saved Card"}
          </button>
          <button
            onClick={() => void loadCheckoutSession(selectedPlanKey)}
            disabled={sessionLoading}
            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sessionLoading ? "Loading..." : "Use Another Card"}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          {/* Plan selection */}
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

          {/* Checkout embed */}
          <div>
            {sessionLoading || !sessionId ? (
              <div className="flex h-full min-h-[500px] items-center justify-center rounded-lg border border-gray-200 bg-white">
                <div className="text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
                  <p className="mt-3 text-sm text-gray-500">Preparing checkout...</p>
                </div>
              </div>
            ) : (
              <WhopEmbeddedCheckoutCard
                sessionId={sessionId}
                email={email}
                submitLabel="Resume access"
                onComplete={() => {
                  void waitForRecovery();
                }}
              />
            )}

            {submitting && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Payment submitted. Restoring your access...
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
