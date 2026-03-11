"use client";

import { useCallback, useMemo } from "react";
import { WhopCheckoutEmbed, useCheckoutEmbedControls } from "@whop/checkout/react";

type BillingAddress = {
  name: string;
  country: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};

type Props = {
  sessionId: string;
  email: string;
  billingAddress?: BillingAddress | null;
  onComplete: () => void;
};

export default function WhopEmbeddedCheckoutCard({
  sessionId,
  email,
  billingAddress,
  onComplete,
}: Props) {
  const checkoutControls = useCheckoutEmbedControls();
  const returnUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "http://localhost:3000/billing/return";
    }

    return `${window.location.origin}/billing/return`;
  }, []);

  const hasBillingAddress = useMemo(
    () =>
      Boolean(
        billingAddress?.name &&
          billingAddress.country &&
          billingAddress.line1 &&
          billingAddress.city &&
          billingAddress.state &&
          billingAddress.postalCode
      ),
    [billingAddress]
  );

  const prefill = useMemo(
    () =>
      hasBillingAddress && billingAddress
        ? { email, address: billingAddress }
        : { email },
    [billingAddress, email, hasBillingAddress]
  );

  const applyBillingAddress = useCallback(() => {
    if (!hasBillingAddress || !billingAddress || !checkoutControls.current) {
      return;
    }

    void checkoutControls.current.setAddress(billingAddress).catch(() => undefined);
  }, [billingAddress, checkoutControls, hasBillingAddress]);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <WhopCheckoutEmbed
        ref={checkoutControls}
        sessionId={sessionId}
        theme="light"
        skipRedirect
        returnUrl={returnUrl}
        prefill={prefill}
        hideEmail
        hideAddressForm={hasBillingAddress}
        setupFutureUsage="off_session"
        themeOptions={{ accentColor: "gray", highContrast: true }}
        onStateChange={(state) => {
          if (state === "ready") {
            applyBillingAddress();
          }
        }}
        onComplete={() => {
          onComplete();
        }}
      />
    </div>
  );
}
