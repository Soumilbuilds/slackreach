import { NextRequest, NextResponse } from "next/server";
import { processDueCampaigns } from "@/lib/campaign-sender";
import { requireApiUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const result = await processDueCampaigns(authResult.user.id);
  return NextResponse.json(result);
}
