import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import { isWhopReady, retryWhopPayment } from "@/lib/whop";

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  if (!isWhopReady()) {
    return NextResponse.json(
      { error: "Whop billing is not configured yet." },
      { status: 503 }
    );
  }

  const billing = await syncUserBillingState(authResult.user);
  const currentPlanKey = billing.plan?.key ?? "starter";

  if (!billing.payment?.id || !billing.payment.retryable) {
    return NextResponse.json(
      {
        error: "There is no retryable payment on file.",
        fallbackToCheckout: true,
        redirectUrl: `/billing/select?plan=${currentPlanKey}&intent=recover`,
      },
      { status: 400 }
    );
  }

  try {
    const payment = await retryWhopPayment(billing.payment.id);

    await prisma.user.update({
      where: { id: authResult.user.id },
      data: {
        whopLastPaymentId: payment.id,
        whopLastPaymentStatus: payment.status,
        whopLastPaymentSubstatus: payment.substatus,
      },
    });

    return NextResponse.json({
      success: payment.status === "paid" || payment.substatus === "succeeded",
      pending: payment.status === "pending",
      paymentId: payment.id,
      paymentStatus: payment.status,
      paymentSubstatus: payment.substatus,
      fallbackToCheckout:
        payment.status !== "paid" &&
        payment.substatus !== "succeeded" &&
        payment.status !== "pending",
      redirectUrl:
        payment.status !== "paid" &&
        payment.substatus !== "succeeded" &&
        payment.status !== "pending"
          ? `/billing/select?plan=${currentPlanKey}&intent=recover`
          : null,
      error: payment.failure_message ?? null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Payment retry failed.";

    return NextResponse.json(
      {
        error: message,
        fallbackToCheckout: true,
        redirectUrl: `/billing/select?plan=${currentPlanKey}&intent=recover`,
      },
      { status: 400 }
    );
  }
}
