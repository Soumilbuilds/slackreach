"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function BillingReturnClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const isSuccess = status === "success";

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    const timeout = setTimeout(() => {
      router.replace("/accounts");
      router.refresh();
    }, 1200);

    return () => clearTimeout(timeout);
  }, [isSuccess, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#faf7f2_0%,#f4efe7_100%)] px-4">
      <div className="w-full max-w-lg rounded-[28px] border border-black/8 bg-white p-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <h1 className="text-3xl font-semibold tracking-[-0.05em] text-neutral-950">
          {isSuccess ? "Authorization complete" : "Return to checkout"}
        </h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          {isSuccess
            ? "Whop sent you back to SlackReach. We are finishing access now."
            : "The payment flow was interrupted. Re-open the embedded checkout to continue."}
        </p>
        <div className="mt-6">
          <button
            onClick={() => router.replace(isSuccess ? "/accounts" : "/billing/select")}
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            {isSuccess ? "Open dashboard" : "Back to billing"}
          </button>
        </div>
      </div>
    </div>
  );
}
