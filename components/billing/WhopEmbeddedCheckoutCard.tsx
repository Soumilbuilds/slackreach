"use client";

import { type ComponentProps, useMemo, useRef, useState } from "react";
import { WhopCheckoutEmbed } from "@whop/checkout/react";

type EmbedState = "loading" | "ready" | "disabled";

type WhopCheckoutEmbedControls = {
  submit: () => Promise<void>;
  getEmail: (timeout?: number) => Promise<string>;
  setEmail: (email: string, timeout?: number) => Promise<void>;
  setAddress: (address: unknown, timeout?: number) => Promise<void>;
  getAddress: (timeout?: number) => Promise<unknown>;
};

type Props = {
  sessionId: string;
  email: string;
  onComplete: () => void;
  submitLabel?: string;
};

export default function WhopEmbeddedCheckoutCard({
  sessionId,
  email,
  onComplete,
  submitLabel = "Continue",
}: Props) {
  const controlsRef = useRef<WhopCheckoutEmbedControls | null>(null);
  const embedRef =
    controlsRef as unknown as ComponentProps<typeof WhopCheckoutEmbed>["ref"];
  const [embedState, setEmbedState] = useState<EmbedState>("loading");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const returnUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "http://localhost:3000/billing/return";
    }

    return `${window.location.origin}/billing/return`;
  }, []);

  const handleSubmit = async () => {
    if (!controlsRef.current || embedState !== "ready" || isSubmitting) {
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await controlsRef.current.submit();
    } catch (error) {
      setIsSubmitting(false);
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : "Unable to submit checkout. Check the form and try again."
      );
    }
  };

  const footerMessage =
    errorMessage ||
    (embedState === "loading"
      ? "Loading secure checkout..."
      : embedState === "disabled"
        ? "Complete the required fields in the checkout form to continue."
        : "Your email is prefilled. No extra billing portal, no redirect loop.");

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
      <div className="overflow-hidden rounded-t-xl bg-white">
        <WhopCheckoutEmbed
          ref={embedRef}
          sessionId={sessionId}
          theme="light"
          skipRedirect
          returnUrl={returnUrl}
          prefill={{ email }}
          hideEmail
          disableEmail
          hideAddressForm
          hideSubmitButton
          setupFutureUsage="off_session"
          themeOptions={{ accentColor: "gray", highContrast: true }}
          onStateChange={(state) => {
            setEmbedState(state);
            if (state !== "disabled") {
              setErrorMessage("");
            }
          }}
          onAddressValidationError={(error) => {
            setErrorMessage(error.error_message);
            setIsSubmitting(false);
          }}
          onComplete={() => {
            onComplete();
          }}
        />
      </div>

      <div className="border-t border-gray-200 bg-gray-50 px-4 py-4">
        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={embedState !== "ready" || isSubmitting}
          className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {isSubmitting ? "Processing..." : submitLabel}
        </button>

        <p
          className={`mt-3 text-center text-xs ${
            errorMessage ? "text-red-600" : "text-gray-500"
          }`}
        >
          {footerMessage}
        </p>
      </div>
    </div>
  );
}
