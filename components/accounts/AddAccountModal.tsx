"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

type LimitError = {
  nextPlanKey: string | null;
  maxAccounts: number;
  planName: string;
};

export default function AddAccountModal({ onClose, onSaved }: Props) {
  const [nickname, setNickname] = useState("");
  const [cookies, setCookies] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [limitError, setLimitError] = useState<LimitError | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = async () => {
    if (!limitError?.nextPlanKey) return;

    setIsUpgrading(true);
    setError("");
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey: limitError.nextPlanKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.fallbackToCheckout && data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
        setError(data.error || "Failed to upgrade.");
        setIsUpgrading(false);
        return;
      }

      if (data.pending) {
        setError(
          "Payment is processing. We will unlock the extra seats as soon as Whop confirms the charge."
        );
        setTimeout(() => {
          window.location.href = "/plans";
        }, 1200);
        return;
      }

      setLimitError(null);
      setError("");
      setTimeout(() => {
        setIsUpgrading(false);
      }, 1500);
    } catch {
      setError("Network error during upgrade.");
      setIsUpgrading(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setLimitError(null);

    if (!nickname.trim() || !cookies.trim()) {
      setError("All fields are required.");
      return;
    }

    try {
      JSON.parse(cookies);
    } catch {
      setError("Cookies must be valid JSON.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          cookies,
        }),
      });

      if (!res.ok) {
        const data = await res.json();

        // Handle account limit reached — show upgrade prompt
        if (res.status === 403 && data.code === "ACCOUNT_LIMIT_REACHED") {
          setLimitError({
            nextPlanKey: data.nextPlanKey ?? null,
            maxAccounts: data.maxAccounts ?? 1,
            planName: data.planName ?? "your plan",
          });
          return;
        }

        setError(data.error || "Failed to save account.");
        return;
      }

      onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Upgrade prompt view ---
  if (limitError) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
          }}
        />

        <div
          style={{
            position: "relative",
            background: "#fff",
            borderRadius: "14px",
            width: "100%",
            maxWidth: "400px",
            margin: "0 16px",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          <div style={{ padding: "32px 32px 0" }}>
            {/* Icon */}
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "#f3f4f6",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#374151"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            <h3
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#111827",
                letterSpacing: "-0.025em",
                margin: "0 0 8px",
              }}
            >
              Account Limit Reached
            </h3>

            <p
              style={{
                fontSize: "14px",
                color: "#6b7280",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              You&apos;ve used all{" "}
              <span style={{ fontWeight: 500, color: "#111827" }}>
                {limitError.maxAccounts}
              </span>{" "}
              account
              {limitError.maxAccounts === 1 ? "" : "s"} included in your{" "}
              <span style={{ fontWeight: 500, color: "#111827" }}>
                {limitError.planName}
              </span>{" "}
              plan. Upgrade to connect more.
            </p>
          </div>

          {error && (
            <p
              style={{
                fontSize: "13px",
                color: "#dc2626",
                margin: "12px 32px 0",
              }}
            >
              {error}
            </p>
          )}

          {/* Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "24px 32px 28px",
              marginTop: "8px",
            }}
          >
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: "13px",
                fontWeight: 500,
                color: "#9ca3af",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Cancel
            </button>

            {limitError.nextPlanKey ? (
              <button
                onClick={handleUpgrade}
                disabled={isUpgrading}
                style={{
                  height: "38px",
                  padding: "0 20px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  border: "1px solid #111827",
                  background: "#111827",
                  color: "#fff",
                  cursor: isUpgrading ? "default" : "pointer",
                  opacity: isUpgrading ? 0.5 : 1,
                  transition: "opacity 150ms",
                }}
              >
                {isUpgrading ? "Upgrading..." : "Upgrade Plan"}
              </button>
            ) : (
              <span
                style={{
                  fontSize: "13px",
                  color: "#9ca3af",
                }}
              >
                You&apos;re on the highest plan
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- Normal add account form ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Add Account
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g., My Workspace"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cookies (JSON)
            </label>
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder='Paste your cookies JSON array here...'
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
