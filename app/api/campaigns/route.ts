import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const campaigns = (await prisma.campaign.findMany({
    where: {
      userId: authResult.user.id,
    },
    orderBy: { createdAt: "desc" },
    include: {
      messages: { orderBy: { sortOrder: "asc" } },
      accounts: {
        include: {
          account: { select: { id: true, nickname: true } },
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
    userId: number;
    name: string;
    status: string;
    dmsPerDay: number;
    nextSendAt: Date | null;
    lastSentAt: Date | null;
    sendError: string | null;
    createdAt: Date;
    messages: Array<{
      id: number;
      campaignId: number;
      messageText: string;
      sortOrder: number;
    }>;
    accounts: Array<{
      id: number;
      campaignId: number;
      accountId: number;
      account: {
        id: number;
        nickname: string;
      };
    }>;
    _count: {
      leads: number;
    };
  }>;

  const campaignIds = campaigns.map((campaign) => campaign.id);
  const leadStatuses =
    campaignIds.length > 0
      ? await prisma.campaignLead.findMany({
          where: {
            campaignId: { in: campaignIds },
            status: { in: ["sent", "skipped"] },
          },
          select: {
            campaignId: true,
            status: true,
          },
        })
      : [];

  const sentByCampaignId = new Map<number, number>();
  const skippedByCampaignId = new Map<number, number>();

  for (const statusEntry of leadStatuses) {
    if (statusEntry.status === "sent") {
      sentByCampaignId.set(
        statusEntry.campaignId,
        (sentByCampaignId.get(statusEntry.campaignId) ?? 0) + 1
      );
    } else if (statusEntry.status === "skipped") {
      skippedByCampaignId.set(
        statusEntry.campaignId,
        (skippedByCampaignId.get(statusEntry.campaignId) ?? 0) + 1
      );
    }
  }

  const result = campaigns.map((campaign) => {
    const totalLeads = campaign._count.leads;
    const sentLeads = sentByCampaignId.get(campaign.id) ?? 0;
    const skippedLeads = skippedByCampaignId.get(campaign.id) ?? 0;
    const uncontactedLeads = Math.max(0, totalLeads - sentLeads - skippedLeads);

    return {
      ...campaign,
      stats: {
        totalLeads,
        sentLeads,
        skippedLeads,
        uncontactedLeads,
      },
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
  const { name, messages, accountIds, dmsPerDay, minDelaySeconds, maxDelaySeconds, skipPreviouslyContacted } = body;

  if (!name || !name.trim()) {
    return NextResponse.json(
      { error: "Campaign name is required" },
      { status: 400 }
    );
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "At least one message is required" },
      { status: 400 }
    );
  }

  if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
    return NextResponse.json(
      { error: "At least one account must be selected" },
      { status: 400 }
    );
  }

  const normalizedAccountIds = Array.from(
    new Set(
      accountIds
        .map((value: unknown) => Number.parseInt(String(value), 10))
        .filter((value: number) => Number.isFinite(value))
    )
  );

  if (normalizedAccountIds.length !== accountIds.length) {
    return NextResponse.json(
      { error: "One or more selected accounts are invalid." },
      { status: 400 }
    );
  }

  const ownedAccountCount = await prisma.account.count({
    where: {
      id: { in: normalizedAccountIds },
      userId: authResult.user.id,
    },
  });

  if (ownedAccountCount !== normalizedAccountIds.length) {
    return NextResponse.json(
      { error: "You can only use your own connected accounts." },
      { status: 400 }
    );
  }

  if (!dmsPerDay || dmsPerDay < 1) {
    return NextResponse.json(
      { error: "DMs per day must be at least 1" },
      { status: 400 }
    );
  }

  const campaign = await prisma.campaign.create({
    data: {
      userId: authResult.user.id,
      name: name.trim(),
      status: "draft",
      dmsPerDay,
      minDelaySeconds: Math.max(10, parseInt(String(minDelaySeconds), 10) || 60),
      maxDelaySeconds: Math.max(10, parseInt(String(maxDelaySeconds), 10) || 180),
      skipPreviouslyContacted: skipPreviouslyContacted === true,
      messages: {
        create: messages.map((text: string, index: number) => ({
          messageText: text,
          sortOrder: index,
        })),
      },
      accounts: {
        create: normalizedAccountIds.map((accountId: number) => ({
          accountId,
        })),
      },
    },
    include: {
      messages: true,
      accounts: { include: { account: true } },
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
