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
    return "Active until period ends";
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
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 mb-3">
          Settings
        </h2>
        <p className="text-sm text-gray-400">Loading settings...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Settings
        </h2>
      </div>

      <div className="max-w-2xl rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-gray-500">Email</span>
          <span className="text-sm font-medium text-gray-900">{user?.email ?? "—"}</span>
        </div>

        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-gray-500">Plan</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">
              {user?.planName ?? "No active plan"}
            </span>
            <Link
              href="/plans"
              className="px-3 py-1 text-xs font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              Change
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm text-gray-500">Billing</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900 capitalize">
              {formatStatus(billing?.membershipStatus ?? null, billing?.cancelAtPeriodEnd ?? false)}
            </span>
            {billing?.membershipStatus &&
              !["active", "trialing", "canceling"].includes(billing.membershipStatus) && (
                <Link
                  href="/billing/blocked"
                  className="px-3 py-1 text-xs font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
                >
                  Resolve
                </Link>
              )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </div>
  );
}
