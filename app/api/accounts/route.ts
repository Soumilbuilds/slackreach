import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { getConnectedAccountAllowance } from "@/lib/billing";
import type { PlanKey } from "@/lib/plans";

const extractDCookieValue = (cookiesRaw: string): string | null => {
  try {
    const parsed = JSON.parse(cookiesRaw);
    if (!Array.isArray(parsed)) return null;
    const dCookie = parsed.find(
      (c: { name?: string }) =>
        typeof c === "object" && c !== null && c.name === "d"
    );
    return typeof dCookie?.value === "string" && dCookie.value.trim()
      ? dCookie.value.trim()
      : null;
  } catch {
    return null;
  }
};

const hashFingerprint = (value: string): string =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex");

const NEXT_PLAN: Record<string, PlanKey> = {
  starter: "growth",
  growth: "unlimited",
};

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const accounts = await prisma.account.findMany({
    where: {
      userId: authResult.user.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      campaigns: {
        include: {
          campaign: { select: { status: true } },
        },
      },
    },
  });

  const typedAccounts = accounts as Array<{
    id: number;
    nickname: string;
    createdAt: Date;
    campaigns: Array<{ campaign: { status: string } }>;
  }>;

  const result = typedAccounts.map((account) => {
    const isInUse = account.campaigns.some(
      (campaignLink) => campaignLink.campaign.status !== "draft"
    );
    return {
      id: account.id,
      nickname: account.nickname,
      createdAt: account.createdAt,
      status: isInUse ? "in-use" : "available",
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const body = await request.json();
  const { nickname, cookies } = body;

  if (!nickname || !cookies) {
    return NextResponse.json(
      { error: "Nickname and cookies are required" },
      { status: 400 }
    );
  }

  // Validate cookies is valid JSON
  try {
    if (typeof cookies === "string") {
      JSON.parse(cookies);
    }
  } catch {
    return NextResponse.json(
      { error: "Cookies must be valid JSON" },
      { status: 400 }
    );
  }

  // Normalize cookies to a JSON string
  const cookiesStr =
    typeof cookies === "string" ? cookies : JSON.stringify(cookies);

  // --- Anti-abuse: cookie fingerprint check ---
  const dValue = extractDCookieValue(cookiesStr);
  let fingerprint: string | null = null;

  if (dValue) {
    fingerprint = hashFingerprint(dValue);

    // Check if this Slack account is already connected by another user
    const existingElsewhere = await prisma.account.findFirst({
      where: {
        cookieFingerprint: fingerprint,
        userId: { not: authResult.user.id },
      },
      include: {
        user: { select: { email: true } },
      },
    });

    if (existingElsewhere) {
      const ownerEmail =
        (existingElsewhere as unknown as { user?: { email?: string } }).user
          ?.email ?? "another user";
      return NextResponse.json(
        {
          error: `This Slack account is already connected by ${ownerEmail}. Each Slack account can only be used by one SlackReach user.`,
          code: "ACCOUNT_ALREADY_CONNECTED",
        },
        { status: 409 }
      );
    }
  }

  // --- Plan account limit check ---
  const allowance = await getConnectedAccountAllowance(authResult.user);
  if (
    allowance.maxAccounts !== null &&
    allowance.currentAccounts >= allowance.maxAccounts
  ) {
    const nextPlanKey = allowance.planKey
      ? NEXT_PLAN[allowance.planKey] ?? null
      : null;
    return NextResponse.json(
      {
        error: `Plan limit reached. ${allowance.planName} allows up to ${allowance.maxAccounts} connected account${
          allowance.maxAccounts === 1 ? "" : "s"
        }.`,
        code: "ACCOUNT_LIMIT_REACHED",
        nextPlanKey,
        maxAccounts: allowance.maxAccounts,
        planName: allowance.planName,
      },
      { status: 403 }
    );
  }

  const account = await prisma.account.create({
    data: {
      userId: authResult.user.id,
      nickname: nickname.trim(),
      cookies: cookiesStr,
      cookieFingerprint: fingerprint,
    },
  });

  return NextResponse.json(account, { status: 201 });
}
