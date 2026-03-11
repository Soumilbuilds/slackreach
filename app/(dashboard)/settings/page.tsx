"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type UserData = {
  email: string;
  planName: string | null;
  planKey: string | null;
};

type BillingStatus = {
  membershipStatus: string | null;
  cancelAtPeriodEnd: boolean;
};

const formatStatus = (status: string | null, cancelAtPeriodEnd: boolean): string => {
  if (!status) {
    return "No active membership";
  }

  if (cancelAtPeriodEnd && status === "canceling") {
    return "Active until the current period ends";
  }

  return status.replaceAll("_", " ");
};

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [meRes, statusRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/billing/status", { cache: "no-store" }),
        ]);

        if (meRes.ok) {
          const meData = await meRes.json();
          setUser({
            email: meData.user?.email ?? "",
            planName: meData.allowance?.planName ?? null,
            planKey: meData.allowance?.planKey ?? null,
          });
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setBilling({
            membershipStatus: statusData.membershipStatus ?? null,
            cancelAtPeriodEnd: Boolean(statusData.cancelAtPeriodEnd),
          });
        }
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

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
      <div>
        <h2 className="mb-3 text-3xl font-semibold tracking-[-0.05em] text-neutral-950">
          Settings
        </h2>
        <p className="text-sm text-neutral-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold tracking-[-0.05em] text-neutral-950">
          Settings
        </h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">
          Billing is handled directly inside SlackReach now. No external customer portal, no redirect loops.
        </p>
      </div>

      <div className="max-w-3xl rounded-[28px] border border-black/8 bg-white shadow-[0_16px_56px_rgba(15,23,42,0.06)]">
        <div className="grid gap-0 divide-y divide-black/6">
          <div className="grid gap-2 px-6 py-5 sm:grid-cols-[160px_1fr] sm:items-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Email
            </span>
            <span className="text-sm font-medium text-neutral-950">{user?.email ?? "—"}</span>
          </div>

          <div className="grid gap-2 px-6 py-5 sm:grid-cols-[160px_1fr] sm:items-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Plan
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-neutral-950">
                {user?.planName ?? "No active plan"}
              </span>
              <Link
                href="/plans"
                className="inline-flex items-center rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
              >
                Change plan
              </Link>
            </div>
          </div>

          <div className="grid gap-2 px-6 py-5 sm:grid-cols-[160px_1fr] sm:items-center">
            <span className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
              Billing status
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium capitalize text-neutral-950">
                {formatStatus(billing?.membershipStatus ?? null, billing?.cancelAtPeriodEnd ?? false)}
              </span>
              {billing?.membershipStatus &&
                !["active", "trialing", "canceling"].includes(billing.membershipStatus) && (
                  <Link
                    href="/billing/blocked"
                    className="inline-flex items-center rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white transition hover:bg-neutral-800"
                  >
                    Resolve billing
                  </Link>
                )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-sm text-neutral-400 transition hover:text-neutral-600 disabled:opacity-50"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}
