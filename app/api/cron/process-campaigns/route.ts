import { NextResponse } from "next/server";
import { processDueCampaigns } from "@/lib/campaign-sender";

// This cron endpoint processes all due campaign DMs.
// No auth required — only reachable from localhost via cron.
// Nginx proxies from the domain but cron calls localhost:3000 directly.

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await processDueCampaigns();
  return NextResponse.json(result);
}

export async function POST() {
  const result = await processDueCampaigns();
  return NextResponse.json(result);
}
