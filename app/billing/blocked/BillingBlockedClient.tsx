"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.key === selectedPlanKey) ?? plans[0] ?? null,
    [plans, selectedPlanKey]
  );

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
      "Payment was submitted. We are still waiting for Whop to reactivate your access. Refresh this page in a few seconds."
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
        setErrorMessage("Whop checkout session could not be created.");
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
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#faf7f2_0%,#f4efe7_100%)] px-4">
        <p className="text-sm text-neutral-500">Checking billing status...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#fae7d6,transparent_38%),linear-gradient(180deg,#faf7f2_0%,#f4efe7_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="overflow-hidden rounded-[32px] border border-rose-200/70 bg-[#161214] text-white shadow-[0_36px_120px_rgba(15,23,42,0.16)]">
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="inline-flex rounded-full border border-rose-300/20 bg-rose-300/12 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-rose-100/86">
              Payment Required
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
              Your workspace is paused until billing is fixed
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/68 sm:text-[15px]">
              Your last payment needs attention, so SlackReach is locked. Retry the saved card if possible, or complete a fresh checkout below to restore access.
            </p>

            <div className="mt-7 grid gap-4 rounded-[24px] border border-white/10 bg-white/4 p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Account</p>
                <p className="mt-2 text-sm font-medium text-white/86">{email || "Signed-in user"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/38">Current state</p>
                <p className="mt-2 text-sm font-medium text-white/86">
                  {billingStatus?.membershipStatus ?? "inactive"}
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {billingStatus?.paymentStatus && (
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/70">
                  Payment: {billingStatus.paymentStatus}
                </span>
              )}
              {billingStatus?.paymentSubstatus && (
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/70">
                  Detail: {billingStatus.paymentSubstatus}
                </span>
              )}
              {billingStatus?.invoiceStatus && (
                <span className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/70">
                  Invoice: {billingStatus.invoiceStatus}
                </span>
              )}
            </div>

            <div className="mt-8 space-y-3">
              {plans.map((plan) => {
                const isSelected = plan.key === selectedPlanKey;

                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => setSelectedPlanKey(plan.key)}
                    className={`w-full rounded-[24px] border px-5 py-5 text-left transition-all ${
                      isSelected
                        ? "border-[#f7dfc2] bg-[#f7dfc2] text-neutral-950 shadow-[0_18px_45px_rgba(247,223,194,0.16)]"
                        : "border-white/10 bg-white/5 text-white/84 hover:border-white/18 hover:bg-white/7"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold tracking-[-0.04em]">{plan.name}</p>
                        <p className={`mt-2 text-sm ${isSelected ? "text-neutral-700" : "text-white/58"}`}>
                          {plan.accountLimit == null
                            ? "Unlimited Slack accounts"
                            : `${plan.accountLimit} Slack account${plan.accountLimit === 1 ? "" : "s"}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-semibold tracking-[-0.05em]">
                          ${plan.monthlyPriceUsd}
                        </p>
                        <p className={`mt-1 text-xs ${isSelected ? "text-neutral-600" : "text-white/48"}`}>
                          per month
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-[32px] border border-black/8 bg-white/70 p-4 shadow-[0_36px_120px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                Recovery Checkout
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-neutral-950 sm:text-[30px]">
                {selectedPlan ? `Resume on ${selectedPlan.name}` : "Resume access"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                If the saved card is still good, retry it. Otherwise, use a fresh checkout and SlackReach will unlock once Whop confirms the payment.
              </p>
            </div>

            {selectedPlan && (
              <div className="rounded-[20px] border border-black/8 bg-black px-4 py-3 text-right text-white shadow-[0_16px_44px_rgba(15,23,42,0.18)]">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/42">Selected plan</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.05em]">
                  ${selectedPlan.monthlyPriceUsd}
                </p>
                <p className="mt-1 text-xs text-white/58">{selectedPlan.name}</p>
              </div>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleRetryPayment}
              disabled={!billingStatus?.canRetryPayment || retryLoading}
              className="inline-flex items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {retryLoading ? "Retrying..." : "Retry saved card"}
            </button>
            <button
              onClick={() => void loadCheckoutSession(selectedPlanKey)}
              disabled={sessionLoading}
              className="inline-flex items-center justify-center rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {sessionLoading ? "Refreshing checkout..." : "Use another card"}
            </button>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-6">
            {sessionLoading || !sessionId ? (
              <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-dashed border-black/10 bg-neutral-50">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-black/10 border-t-black" />
                  <p className="mt-4 text-sm text-neutral-500">Preparing secure checkout...</p>
                </div>
              </div>
            ) : (
              <WhopEmbeddedCheckoutCard
                sessionId={sessionId}
                email={email}
                onComplete={() => {
                  void waitForRecovery();
                }}
              />
            )}
          </div>

          {submitting && (
            <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Payment submitted. Waiting for Whop to restore your access.
            </div>
          )}

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-6 text-xs text-neutral-400 transition hover:text-neutral-600"
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </section>
      </div>
    </div>
  );
}
