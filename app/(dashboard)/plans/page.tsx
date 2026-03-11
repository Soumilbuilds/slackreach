"use client";

import { useCallback, useEffect, useState } from "react";

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

type BillingStatusResponse = {
  membershipStatus: string | null;
  cancelAtPeriodEnd: boolean;
};

const PLAN_ORDER = ["starter", "growth", "unlimited"];

const planIndex = (key: string | null): number => {
  if (!key) return -1;
  return PLAN_ORDER.indexOf(key);
};

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [plansRes, meRes, statusRes] = await Promise.all([
        fetch("/api/plans"),
        fetch("/api/auth/me"),
        fetch("/api/billing/status", { cache: "no-store" }),
      ]);

      if (plansRes.ok) {
        const plansData = await plansRes.json();
        setPlans(plansData.plans ?? []);
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        setCurrentPlanKey(meData.allowance?.planKey ?? null);
      }

      if (statusRes.ok) {
        const statusData = (await statusRes.json()) as BillingStatusResponse;
        setMembershipStatus(statusData.membershipStatus ?? null);
        setCancelAtPeriodEnd(Boolean(statusData.cancelAtPeriodEnd));
      }
    } catch {
      setError("Unable to load plan information right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handlePlanAction = async (targetPlanKey: string) => {
    setActionLoading(targetPlanKey);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: targetPlanKey }),
      });

      const payload = await response.json();

      if (response.ok) {
        if (payload.pending) {
          setSuccess("Payment is processing. We will update your plan as soon as Whop confirms the charge.");
        } else {
          setSuccess(
            `Moving you to ${payload.plan?.name ?? targetPlanKey}. The new plan will show up as soon as Whop confirms it.`
          );
        }

        setTimeout(() => {
          void fetchData();
        }, 1500);
        return;
      }

      if (payload.fallbackToCheckout && payload.redirectUrl) {
        window.location.href = payload.redirectUrl;
        return;
      }

      setError(payload.error || "Something went wrong.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const getButtonState = (
    plan: Plan
  ): { label: string; disabled: boolean; style: "dark" | "light" } => {
    const currentIdx = planIndex(currentPlanKey);
    const targetIdx = planIndex(plan.key);

    if (plan.key === currentPlanKey) {
      if (membershipStatus === "trialing") {
        return {
          label: "Current plan (Trial)",
          disabled: true,
          style: "light",
        };
      }

      if (cancelAtPeriodEnd) {
        return {
          label: "Current plan (Cancels later)",
          disabled: true,
          style: "light",
        };
      }

      return { label: "Current plan", disabled: true, style: "light" };
    }

    if (currentIdx === -1) {
      return { label: "Get started", disabled: false, style: "dark" };
    }

    if (targetIdx > currentIdx) {
      return { label: "Upgrade", disabled: false, style: "dark" };
    }

    return { label: "Downgrade", disabled: false, style: "light" };
  };

  if (loading) {
    return (
      <div>
        <h2 className="mb-3 text-3xl font-semibold tracking-[-0.05em] text-neutral-950">
          Plans
        </h2>
        <p className="text-sm text-neutral-400">Loading plan options...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.05em] text-neutral-950">
            Plans
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
            Change plans without leaving SlackReach. We try the saved card first. If Whop needs a fresh payment, we bring up the embedded checkout inside the app.
          </p>
        </div>

        {membershipStatus && (
          <div className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-neutral-600 shadow-sm">
            Membership status: <span className="text-neutral-950">{membershipStatus}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {plans.map((plan) => {
          const button = getButtonState(plan);
          const isCurrent = plan.key === currentPlanKey;

          return (
            <article
              key={plan.key}
              className={`flex h-full flex-col overflow-hidden rounded-[28px] border bg-white shadow-[0_16px_56px_rgba(15,23,42,0.06)] transition ${
                isCurrent
                  ? "border-black/15"
                  : "border-black/8 hover:-translate-y-0.5 hover:shadow-[0_22px_68px_rgba(15,23,42,0.08)]"
              }`}
            >
              <div className={`px-6 pb-6 pt-7 ${isCurrent ? "bg-[linear-gradient(180deg,rgba(17,24,39,0.06),rgba(255,255,255,0))]" : ""}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xl font-semibold tracking-[-0.04em] text-neutral-950">
                      {plan.name}
                    </p>
                    <p className="mt-2 text-sm text-neutral-500">
                      {plan.accountLimit == null
                        ? "Unlimited Slack accounts"
                        : `${plan.accountLimit} Slack account${plan.accountLimit === 1 ? "" : "s"}`}
                    </p>
                  </div>

                  {isCurrent && (
                    <span className="rounded-full bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-white">
                      Active
                    </span>
                  )}
                </div>

                <div className="mt-8 flex items-end gap-2">
                  <span className="text-[42px] font-semibold tracking-[-0.08em] text-neutral-950">
                    ${plan.monthlyPriceUsd}
                  </span>
                  <span className="pb-2 text-sm text-neutral-400">/ month</span>
                </div>

                {plan.trialDays > 0 && (
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.22em] text-neutral-500">
                    Includes {plan.trialDays}-day trial
                  </p>
                )}
              </div>

              <div className="flex-1 border-t border-black/6 px-6 py-6">
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className="flex items-start gap-3 text-sm">
                      <span
                        className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          feature.included
                            ? "bg-neutral-950 text-white"
                            : "bg-neutral-100 text-neutral-300"
                        }`}
                      >
                        {feature.included ? "•" : "×"}
                      </span>
                      <span
                        className={feature.included ? "text-neutral-600" : "text-neutral-300 line-through"}
                      >
                        {feature.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-6 pb-6">
                <button
                  onClick={() => handlePlanAction(plan.key)}
                  disabled={button.disabled || actionLoading !== null}
                  className={`w-full rounded-full px-5 py-3 text-sm font-medium transition ${
                    button.style === "dark"
                      ? "bg-black text-white hover:bg-neutral-800"
                      : "border border-black/10 bg-white text-neutral-700 hover:bg-neutral-50"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {actionLoading === plan.key ? "Processing..." : button.label}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
