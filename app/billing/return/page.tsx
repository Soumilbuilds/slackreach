import { Suspense } from "react";
import BillingReturnClient from "./BillingReturnClient";

export const dynamic = "force-dynamic";

function BillingReturnFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Processing Checkout
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Finalizing your billing state...
        </p>
      </div>
    </div>
  );
}

export default function BillingReturnPage() {
  return (
    <Suspense fallback={<BillingReturnFallback />}>
      <BillingReturnClient />
    </Suspense>
  );
}
