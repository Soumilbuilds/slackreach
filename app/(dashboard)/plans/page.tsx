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
          setSuccess("Payment is processing. Your plan will update once confirmed.");
        } else {
          setSuccess(
            `Moving you to ${payload.plan?.name ?? targetPlanKey}. Your plan will update once confirmed.`
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
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 mb-3">
          Plans
        </h2>
        <p className="text-sm text-gray-400">Loading plan options...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
            Plans
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Change or upgrade your plan anytime.
          </p>
        </div>

        {membershipStatus && (
          <span className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600">
            {membershipStatus}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        {plans.map((plan) => {
          const button = getButtonState(plan);
          const isCurrent = plan.key === currentPlanKey;

          return (
            <div
              key={plan.key}
              className={`flex flex-col rounded-lg border bg-white overflow-hidden ${
                isCurrent ? "border-gray-900" : "border-gray-200"
              }`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">
                    {plan.name}
                  </p>
                  {isCurrent && (
                    <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-[11px] font-medium text-white">
                      Active
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  {plan.accountLimit == null
                    ? "Unlimited accounts"
                    : `${plan.accountLimit} account${plan.accountLimit === 1 ? "" : "s"}`}
                </p>

                <div className="mt-5 flex items-end gap-1">
                  <span className="text-3xl font-semibold tracking-tight text-gray-900">
                    ${plan.monthlyPriceUsd}
                  </span>
                  <span className="text-sm text-gray-400 pb-0.5">/month</span>
                </div>

                {plan.trialDays > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Includes {plan.trialDays}-day free trial
                  </p>
                )}
              </div>

              <div className="flex-1 border-t border-gray-100 px-6 py-5">
                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className="flex items-center gap-2.5 text-sm">
                      {feature.included ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-[10px] text-white">
                          ✓
                        </span>
                      ) : (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-100 text-[10px] text-gray-400">
                          ×
                        </span>
                      )}
                      <span className={feature.included ? "text-gray-700" : "text-gray-400 line-through"}>
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
                  className={`w-full px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    button.style === "dark"
                      ? "bg-gray-900 text-white hover:bg-gray-800"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {actionLoading === plan.key ? "Processing..." : button.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
