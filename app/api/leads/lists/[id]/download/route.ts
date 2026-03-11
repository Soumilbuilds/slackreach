import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

const csvEscape = (value: string | number | null | undefined): string => {
  const text = value == null ? "" : String(value);

  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

export async function GET(
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
      leads: {
        orderBy: { realName: "asc" },
      },
    },
  });

  if (!leadList) {
    return NextResponse.json({ error: "Lead list not found" }, { status: 404 });
  }

  const headers = [
    "slack_user_id",
    "username",
    "real_name",
    "first_name",
    "last_name",
    "display_name",
    "title",
    "timezone",
    "team_id",
    "channel_id",
  ];

  const rows = (leadList.leads as Array<{
    slackUserId: string;
    username: string;
    realName: string;
    firstName: string;
    lastName: string | null;
    displayName: string | null;
    title: string | null;
    timezone: string | null;
    teamId: string;
  }>).map((lead) =>
    [
      lead.slackUserId,
      lead.username,
      lead.realName,
      lead.firstName,
      lead.lastName,
      lead.displayName,
      lead.title,
      lead.timezone,
      lead.teamId,
      leadList.channelId,
    ]
      .map((value) => csvEscape(value))
      .join(",")
  );

  const csv = `${headers.join(",")}\n${rows.join("\n")}`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-list-${leadList.id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
