import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { syncUserBillingState } from "@/lib/billing";
import { isWhopReady } from "@/lib/whop";

const ACTIVE_STATUSES = new Set(["active", "trialing", "canceling"]);

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  if (isWhopReady()) {
    const billing = await syncUserBillingState(authResult.user);
    const status = billing.membershipStatus;
    if (status && !ACTIVE_STATUSES.has(status)) {
      return NextResponse.json(
        {
          error:
            "You cannot remove accounts while your subscription is inactive. Please resolve your billing issue first.",
          code: "SUBSCRIPTION_INACTIVE",
        },
        { status: 403 }
      );
    }
  }

  const { id } = await params;
  const accountId = parseInt(id, 10);

  if (isNaN(accountId)) {
    return NextResponse.json({ error: "Invalid account ID" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      userId: authResult.user.id,
    },
    select: { id: true },
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  try {
    await prisma.account.delete({ where: { id: accountId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
}
