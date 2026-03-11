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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          {isSuccess ? "Payment complete" : "Return to checkout"}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {isSuccess
            ? "Finishing setup. You will be redirected shortly."
            : "The payment flow was interrupted. Go back to try again."}
        </p>
        <div className="mt-6">
          <button
            onClick={() => router.replace(isSuccess ? "/accounts" : "/billing/select")}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          >
            {isSuccess ? "Open dashboard" : "Back to billing"}
          </button>
        </div>
      </div>
    </div>
  );
}
