"use client";

import { useState } from "react";

interface Props {
  onClose: () => void;
  onFinish: () => void;
}

const STEPS = [
  {
    step: 1,
    title: "Install Cookie Editor",
    description:
      "You'll need this free Chrome extension to export cookies from Slack. If you already have it, skip to the next step.",
    link: "https://chromewebstore.google.com/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm",
    linkLabel: "Open Chrome Web Store",
  },
  {
    step: 2,
    title: "Open Your Slack Workspace",
    description:
      "Navigate to the Slack community whose members you want to reach. Make sure you're logged in and can see the channel list.",
  },
  {
    step: 3,
    title: "Export Cookies as JSON",
    description: "Use Cookie Editor to copy your Slack session cookies.",
    substeps: [
      "Click the Cookie Editor icon in your toolbar",
      "Click Export in the extension popup",
      "Choose JSON — cookies are copied to your clipboard",
    ],
  },
];

export default function AccountOnboardingModal({ onClose, onFinish }: Props) {
  const [step, setStep] = useState(0);

  const isLastStep = step === STEPS.length - 1;
  const current = STEPS[step];

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
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
        }}
      />

      {/* Card */}
      <div
        style={{
          position: "relative",
          background: "#fff",
          borderRadius: "14px",
          width: "100%",
          maxWidth: "440px",
          margin: "0 16px",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)",
          overflow: "hidden",
        }}
      >
        {/* Progress dots */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "8px",
            paddingTop: "28px",
          }}
        >
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i <= step ? "24px" : "8px",
                height: "8px",
                borderRadius: "100px",
                background: i <= step ? "#111827" : "#e5e7eb",
                transition: "all 300ms ease",
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "24px 32px 0" }}>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "#9ca3af",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              marginBottom: "6px",
            }}
          >
            Step {step + 1} of {STEPS.length}
          </p>

          <h3
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "#111827",
              letterSpacing: "-0.025em",
              lineHeight: 1.3,
              margin: 0,
            }}
          >
            {current.title}
          </h3>

          <p
            style={{
              fontSize: "14px",
              color: "#6b7280",
              lineHeight: 1.6,
              marginTop: "10px",
            }}
          >
            {current.description}
          </p>

          {/* Chrome Web Store link (Step 1) */}
          {current.link && (
            <a
              href={current.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "16px",
                fontSize: "13px",
                fontWeight: 500,
                color: "#111827",
                textDecoration: "none",
                borderBottom: "1px solid #d1d5db",
                paddingBottom: "1px",
              }}
            >
              {current.linkLabel}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}

          {/* Numbered substeps (Step 3) */}
          {current.substeps && (
            <div style={{ marginTop: "18px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {current.substeps.map((text, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: "22px",
                      height: "22px",
                      borderRadius: "50%",
                      background: "#f3f4f6",
                      color: "#374151",
                      fontSize: "12px",
                      fontWeight: 600,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    style={{
                      fontSize: "13px",
                      color: "#4b5563",
                      lineHeight: 1.5,
                      paddingTop: "2px",
                    }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

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
            onClick={step === 0 ? onClose : () => setStep(step - 1)}
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
            {step === 0 ? "Cancel" : "Back"}
          </button>

          <button
            onClick={() => {
              if (isLastStep) {
                onFinish();
              } else {
                setStep(step + 1);
              }
            }}
            style={{
              height: "38px",
              padding: "0 20px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              cursor: "pointer",
              transition: "opacity 150ms",
            }}
          >
            {isLastStep ? "Connect Account" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
