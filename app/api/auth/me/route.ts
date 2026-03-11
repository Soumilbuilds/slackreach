import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromRequest } from "@/lib/auth";
import { getConnectedAccountAllowance } from "@/lib/billing";

export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allowance = await getConnectedAccountAllowance(user);

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    allowance,
  });
}
