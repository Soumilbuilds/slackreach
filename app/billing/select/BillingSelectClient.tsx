"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function BillingSelectClient({ email }: { email: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState<string>(
    searchParams.get("plan") ?? "starter"
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
    const requestedPlan = searchParams.get("plan");
    if (requestedPlan) {
      setSelectedPlanKey(requestedPlan);
    }
  }, [searchParams]);

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
      "Payment was submitted. We are still waiting for Whop to confirm your access. Refresh this page in a few seconds."
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
          setErrorMessage("Whop checkout session could not be created.");
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
    if (!selectedPlanKey || plansLoading) {
      return;
    }

    void loadCheckoutSession(selectedPlanKey);
  }, [loadCheckoutSession, plansLoading, selectedPlanKey]);

  const selectedPlan =
    plans.find((plan) => plan.key === selectedPlanKey) ?? plans[0] ?? null;

  const copy =
    intent === "plan_change"
      ? {
          eyebrow: "Plan Change",
          title: "Switch plans without leaving SlackReach",
          description:
            "We will try to preserve the cleanest path possible. If your saved card cannot be charged off-session, finish the change below.",
          kicker: "No proration. No refund math. Just a clean move to the new plan.",
        }
      : intent === "account_limit_upgrade"
        ? {
            eyebrow: "Unlock More Seats",
            title: "Upgrade and keep moving",
            description:
              "Your current seat limit is reached. Choose a higher plan and finish payment here to unlock more Slack accounts immediately.",
            kicker: "Once billing clears, the extra account slots open automatically.",
          }
        : intent === "recover"
          ? {
              eyebrow: "Resume Access",
              title: "Bring your workspace back online",
              description:
                "Your last billing cycle needs attention. Complete payment below to restore access and resume sending.",
              kicker: "We keep you on a locked billing screen until access is active again.",
            }
          : {
              eyebrow: "Start Trial",
              title: "Start your trial now",
              description:
                "SlackReach stays locked until billing is set up. Your email is already passed through, so this is just plan selection and payment.",
              kicker: "Starter includes a 7-day trial. Growth and Unlimited begin billing immediately.",
            };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f7f1e8,transparent_42%),linear-gradient(180deg,#faf7f2_0%,#f4efe7_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        <section className="overflow-hidden rounded-[32px] border border-black/8 bg-[#121212] text-white shadow-[0_36px_120px_rgba(15,23,42,0.18)]">
          <div className="flex h-full flex-col p-6 sm:p-8 lg:p-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50">
                {copy.eyebrow}
              </p>
              <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-[-0.06em] text-white sm:text-5xl">
                {copy.title}
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/68 sm:text-[15px]">
                {copy.description}
              </p>
            </div>

            <div className="mt-8 grid gap-4 rounded-[24px] border border-white/10 bg-white/4 p-4 backdrop-blur-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">
                  Signed In As
                </p>
                <p className="mt-2 text-sm font-medium text-white/88">{email}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/40">
                  Billing Flow
                </p>
                <p className="mt-2 text-sm font-medium text-white/88">{copy.kicker}</p>
              </div>
            </div>

            <div className="mt-8 flex-1 space-y-3">
              {plans.map((plan) => {
                const isSelected = plan.key === selectedPlanKey;
                const buttonLabel =
                  intent === "signup" && plan.trialDays > 0 ? "Start trial" : "Select";

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
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold tracking-[-0.04em]">{plan.name}</p>
                          {plan.trialDays > 0 && (
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                              isSelected ? "bg-neutral-950 text-[#f7dfc2]" : "bg-white/10 text-white/68"
                            }`}>
                              {plan.trialDays}-day trial
                            </span>
                          )}
                        </div>
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

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {plan.features
                          .filter((feature) => feature.included)
                          .slice(0, 3)
                          .map((feature) => (
                            <span
                              key={feature.label}
                              className={`rounded-full px-2.5 py-1 text-[11px] ${
                                isSelected
                                  ? "bg-black/6 text-neutral-700"
                                  : "bg-white/8 text-white/64"
                              }`}
                            >
                              {feature.label}
                            </span>
                          ))}
                      </div>

                      <span className={`text-xs font-medium ${isSelected ? "text-neutral-900" : "text-white/72"}`}>
                        {isSelected ? "Selected" : buttonLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="flex min-h-[640px] flex-col rounded-[32px] border border-black/8 bg-white/70 p-4 shadow-[0_36px_120px_rgba(15,23,42,0.10)] backdrop-blur-sm sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-500">
                Payment Panel
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-neutral-950 sm:text-[30px]">
                {selectedPlan ? `${selectedPlan.name} checkout` : "Checkout"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-neutral-600">
                Finish payment here. If billing clears successfully, SlackReach unlocks automatically.
              </p>
            </div>
            {selectedPlan && (
              <div className="rounded-[20px] border border-black/8 bg-black px-4 py-3 text-right text-white shadow-[0_16px_44px_rgba(15,23,42,0.18)]">
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/42">Current selection</p>
                <p className="mt-1 text-2xl font-semibold tracking-[-0.05em]">
                  ${selectedPlan.monthlyPriceUsd}
                </p>
                <p className="mt-1 text-xs text-white/58">{selectedPlan.name}</p>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {errorMessage}
            </div>
          )}

          <div className="mt-6 flex-1">
            {sessionLoading || !sessionId ? (
              <div className="flex h-full min-h-[520px] items-center justify-center rounded-[28px] border border-dashed border-black/10 bg-neutral-50">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-black/10 border-t-black" />
                  <p className="mt-4 text-sm text-neutral-500">
                    {plansLoading ? "Loading plans..." : "Preparing secure checkout..."}
                  </p>
                </div>
              </div>
            ) : (
              <WhopEmbeddedCheckoutCard
                sessionId={sessionId}
                email={email}
                onComplete={() => {
                  void waitForActivation();
                }}
              />
            )}
          </div>

          {submitting && (
            <div className="mt-5 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Payment submitted. Waiting for Whop to confirm your access.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
