import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import {
  buildCookieHeaderFromJson,
  extractTeamIdFromWorkspaceUrl,
  isSlackWorkspaceUrl,
  resolveTeamIdForWorkspace,
} from "@/lib/slack";

const normalizeChannelId = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

const normalizeRequestedCount = (value: unknown): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(1, Math.min(5000, Math.floor(parsed)));
};

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const leadLists = (await prisma.leadList.findMany({
    where: {
      userId: authResult.user.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      account: {
        select: {
          id: true,
          nickname: true,
        },
      },
      _count: {
        select: {
          leads: true,
        },
      },
    },
  })) as Array<{
    id: number;
    workspaceUrl: string;
    teamId: string;
    channelId: string;
    requestedCount: number;
    scrapedCount: number;
    status: string;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    account: {
      id: number;
      nickname: string;
    };
    _count: {
      leads: number;
    };
  }>;

  return NextResponse.json(
    leadLists.map((list) => ({
      id: list.id,
      workspaceUrl: list.workspaceUrl,
      teamId: list.teamId,
      channelId: list.channelId,
      requestedCount: list.requestedCount,
      scrapedCount: list.scrapedCount,
      status: list.status,
      errorMessage: list.errorMessage,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      account: list.account,
      leadCount: list._count.leads,
    }))
  );
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const body = await request.json();

  const workspaceUrl =
    typeof body.workspaceUrl === "string" ? body.workspaceUrl.trim() : "";
  const channelId = normalizeChannelId(body.channelId);
  const requestedCount = normalizeRequestedCount(body.requestedCount);

  if (!workspaceUrl) {
    return NextResponse.json(
      { error: "Workspace URL is required" },
      { status: 400 }
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(workspaceUrl);
  } catch {
    return NextResponse.json(
      { error: "Workspace URL must be a valid URL" },
      { status: 400 }
    );
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json(
      { error: "Workspace URL must start with http:// or https://" },
      { status: 400 }
    );
  }

  if (!isSlackWorkspaceUrl(workspaceUrl)) {
    return NextResponse.json(
      { error: "Workspace URL must be a Slack URL (e.g. https://yourteam.slack.com/)" },
      { status: 400 }
    );
  }

  if (!channelId) {
    return NextResponse.json(
      { error: "Channel ID is required" },
      { status: 400 }
    );
  }

  if (!requestedCount) {
    return NextResponse.json(
      { error: "Requested count must be at least 1" },
      { status: 400 }
    );
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: authResult.user.id,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!account) {
    return NextResponse.json(
      { error: "Add at least one account before scraping leads." },
      { status: 400 }
    );
  }

  let cookieHeader: string;
  try {
    cookieHeader = buildCookieHeaderFromJson(account.cookies);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Invalid account cookies. Reconnect account.";

    return NextResponse.json({ error: message }, { status: 400 });
  }

  const teamId =
    extractTeamIdFromWorkspaceUrl(workspaceUrl) ||
    (await resolveTeamIdForWorkspace({
      workspaceUrl,
      cookieHeader,
    })) ||
    "PENDING";

  // Save workspace URL to account for future token extraction
  const workspaceBase = `https://${parsedUrl.hostname}/`;
  if (!account.workspaceUrl) {
    await prisma.account.update({
      where: { id: account.id },
      data: { workspaceUrl: workspaceBase },
    });
  }

  const leadList = await prisma.leadList.create({
    data: {
      userId: authResult.user.id,
      workspaceUrl,
      teamId,
      channelId,
      requestedCount,
      status: "pending",
      accountId: account.id,
    },
  });

  return NextResponse.json(leadList, { status: 201 });
}
