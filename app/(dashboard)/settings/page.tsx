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
  if (!status) return "No active subscription";
  if (cancelAtPeriodEnd && status === "canceling") return "Active until period ends";
  return status.replaceAll("_", " ");
};

const statusColor = (status: string | null): string => {
  if (!status) return "#9ca3af";
  if (["active", "trialing"].includes(status)) return "#059669";
  if (["canceling"].includes(status)) return "#d97706";
  if (["past_due", "unresolved"].includes(status)) return "#dc2626";
  return "#374151";
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
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900 mb-1">
          Settings
        </h2>
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  const billingStatusText = formatStatus(
    billing?.membershipStatus ?? null,
    billing?.cancelAtPeriodEnd ?? false
  );

  const billingColorValue = statusColor(billing?.membershipStatus ?? null);

  const needsResolve =
    billing?.membershipStatus &&
    !["active", "trialing", "canceling"].includes(billing.membershipStatus);

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Settings
        </h2>
        <p style={{ marginTop: "4px", fontSize: "14px", color: "#6b7280" }}>
          Manage your account and subscription.
        </p>
      </div>

      <div style={{ maxWidth: "672px", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Account section */}
        <div>
          <h3 style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "12px" }}>
            Account
          </h3>
          <div style={{ borderRadius: "12px", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "9999px",
                  backgroundColor: "#f3f4f6",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "#4b5563",
                  textTransform: "uppercase",
                }}>
                  {user?.email?.charAt(0) ?? "?"}
                </div>
                <div>
                  <p style={{ fontSize: "14px", fontWeight: 500, color: "#111827", margin: 0 }}>
                    {user?.email ?? "—"}
                  </p>
                  <p style={{ fontSize: "12px", color: "#9ca3af", margin: 0 }}>
                    Email address
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription section */}
        <div>
          <h3 style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "12px" }}>
            Subscription
          </h3>
          <div style={{ borderRadius: "12px", border: "1px solid #e5e7eb", backgroundColor: "#ffffff", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>Current plan</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "#111827" }}>
                  {user?.planName ?? "No active plan"}
                </span>
                <Link
                  href="/plans"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    backgroundColor: "#ffffff",
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#374151",
                    textDecoration: "none",
                    transition: "all 150ms",
                  }}
                >
                  Change
                </Link>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>Billing status</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: billingColorValue, textTransform: "capitalize" }}>
                  {billingStatusText}
                </span>
                {needsResolve && (
                  <Link
                    href="/billing/blocked"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      borderRadius: "8px",
                      backgroundColor: "#111827",
                      padding: "6px 12px",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#ffffff",
                      textDecoration: "none",
                      transition: "all 150ms",
                    }}
                  >
                    Resolve
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sign out */}
        <div style={{ paddingTop: "16px", borderTop: "1px solid #f3f4f6" }}>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "14px",
              color: "#9ca3af",
              backgroundColor: "transparent",
              border: "none",
              cursor: signingOut ? "not-allowed" : "pointer",
              opacity: signingOut ? 0.5 : 1,
              padding: 0,
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af"; }}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
