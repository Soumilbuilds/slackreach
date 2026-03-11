import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import {
  buildCookieHeaderFromJson,
  resolveTeamIdForWorkspace,
  resolveXoxcToken,
  scrapeSlackLeads,
} from "@/lib/slack";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown scraping error.";
};

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

  const leadList = await prisma.leadList.findFirst({
    where: {
      id: listId,
      userId: authResult.user.id,
    },
    include: {
      account: true,
    },
  });

  if (!leadList) {
    return NextResponse.json({ error: "Lead list not found" }, { status: 404 });
  }

  await prisma.leadList.update({
    where: { id: listId },
    data: {
      status: "scraping",
      errorMessage: null,
    },
  });

  try {
    const cookieHeader = buildCookieHeaderFromJson(leadList.account.cookies);
    let teamId = leadList.teamId;

    if (!teamId || teamId === "PENDING") {
      const resolvedTeamId = await resolveTeamIdForWorkspace({
        workspaceUrl: leadList.workspaceUrl,
        cookieHeader,
      });

      if (!resolvedTeamId) {
        throw new Error(
          "Could not resolve team ID from workspace URL. Try an app client URL (https://app.slack.com/client/TXXXX/CXXXX) or reconnect account cookies."
        );
      }

      teamId = resolvedTeamId;

      await prisma.leadList.update({
        where: { id: listId },
        data: { teamId },
      });
    }

    const token = await resolveXoxcToken({
      workspaceUrl: leadList.workspaceUrl,
      teamId,
      channelId: leadList.channelId,
      cookieHeader,
    });

    const leads = await scrapeSlackLeads({
      teamId,
      channelId: leadList.channelId,
      requestedCount: leadList.requestedCount,
      xoxcToken: token,
      cookieHeader,
    });

    await prisma.$transaction(async (tx) => {
      await tx.lead.deleteMany({ where: { listId } });

      if (leads.length > 0) {
        await tx.lead.createMany({
          data: leads.map((lead) => ({
            listId,
            slackUserId: lead.slackUserId,
            teamId: lead.teamId,
            username: lead.username,
            realName: lead.realName,
            displayName: lead.displayName,
            firstName: lead.firstName,
            lastName: lead.lastName,
            title: lead.title,
            timezone: lead.timezone,
            avatarUrl: lead.avatarUrl,
            profileRaw: lead.profileRaw,
          })),
        });
      }

      await tx.leadList.update({
        where: { id: listId },
        data: {
          status: "completed",
          errorMessage: null,
          scrapedCount: leads.length,
        },
      });
    });

    return NextResponse.json({
      success: true,
      scrapedCount: leads.length,
    });
  } catch (error) {
    const message = getErrorMessage(error);

    await prisma.leadList.update({
      where: { id: listId },
      data: {
        status: "failed",
        errorMessage: message,
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
