import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id } = await params;
  const listId = Number.parseInt(id, 10);

  if (Number.isNaN(listId)) {
    return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
  }

  const body = await request.json();
  const campaignId = Number.parseInt(String(body.campaignId), 10);

  if (Number.isNaN(campaignId)) {
    return NextResponse.json(
      { error: "Valid campaign ID is required" },
      { status: 400 }
    );
  }

  const [leadList, campaign] = await Promise.all([
    prisma.leadList.findFirst({
      where: {
        id: listId,
        userId: authResult.user.id,
      },
    }),
    prisma.campaign.findFirst({
      where: {
        id: campaignId,
        userId: authResult.user.id,
      },
    }),
  ]);

  if (!leadList) {
    return NextResponse.json({ error: "Lead list not found" }, { status: 404 });
  }

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const leads = (await prisma.lead.findMany({
    where: { listId },
    select: {
      id: true,
      slackUserId: true,
    },
  })) as Array<{ id: number; slackUserId: string }>;

  if (leads.length === 0) {
    return NextResponse.json(
      { error: "No leads available in this list. Scrape leads first." },
      { status: 400 }
    );
  }

  const leadIds = leads.map((lead) => lead.id);
  const slackUserIds = leads.map((lead) => lead.slackUserId);
  const slackUserIdByLeadId = new Map(
    leads.map((lead) => [lead.id, lead.slackUserId] as const)
  );

  const added = await prisma.$transaction(async (tx) => {
    // Only check if lead is already in THIS campaign (by leadId or slackUserId).
    // Cross-campaign contacts are intentionally allowed.
    const [existingLinksByLeadId, existingLinksBySlackUserId] = await Promise.all([
      tx.campaignLead.findMany({
        where: {
          campaignId,
          leadId: { in: leadIds },
        },
        select: { leadId: true },
      }),
      tx.campaignLead.findMany({
        where: {
          campaignId,
          lead: {
            slackUserId: { in: slackUserIds },
          },
        },
        select: {
          lead: { select: { slackUserId: true } },
        },
      }),
    ]);

    const existingLeadIds = new Set<number>(
      existingLinksByLeadId.map((link: { leadId: number }) => link.leadId)
    );
    const existingSlackUsersInCampaign = new Set<string>(
      existingLinksBySlackUserId.map(
        (link: { lead: { slackUserId: string } }) => link.lead.slackUserId
      )
    );

    const newLinks = leadIds
      .filter((leadId) => {
        if (existingLeadIds.has(leadId)) return false;
        const slackUserId = slackUserIdByLeadId.get(leadId);
        if (!slackUserId) return false;
        if (existingSlackUsersInCampaign.has(slackUserId)) return false;
        return true;
      })
      .map((leadId) => ({ campaignId, leadId }));

    if (newLinks.length > 0) {
      await tx.campaignLead.createMany({ data: newLinks });
    }

    await tx.leadList.delete({
      where: { id: listId },
    });

    return newLinks.length;
  });

  return NextResponse.json({
    success: true,
    added,
    total: leadIds.length,
    listDeleted: true,
  });
}
