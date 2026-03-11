"use client";

import { useMemo } from "react";
import { WhopCheckoutEmbed } from "@whop/checkout/react";

type Props = {
  sessionId: string;
  email: string;
  onComplete: () => void;
};

export default function WhopEmbeddedCheckoutCard({
  sessionId,
  email,
  onComplete,
}: Props) {
  const returnUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "http://localhost:3000/billing/return";
    }

    return `${window.location.origin}/billing/return`;
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <WhopCheckoutEmbed
        sessionId={sessionId}
        theme="light"
        skipRedirect
        returnUrl={returnUrl}
        prefill={{ email }}
        hideEmail
        disableEmail
        hideAddressForm
        setupFutureUsage="off_session"
        themeOptions={{ accentColor: "gray", highContrast: true }}
        onComplete={() => {
          onComplete();
        }}
      />
    </div>
  );
}
