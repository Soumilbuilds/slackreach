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
    <div className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
      <div className="border-b border-black/6 bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(255,255,255,0))] px-6 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-500">
          Secure Checkout
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          Your email is prefilled and locked. Only the payment step remains.
        </p>
      </div>

      <div className="px-3 pb-3 pt-2 sm:px-4 sm:pb-4">
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
          onComplete={() => onComplete()}
        />
      </div>
    </div>
  );
}
