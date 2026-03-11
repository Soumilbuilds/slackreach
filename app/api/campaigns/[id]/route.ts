import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";
import { scheduleCampaignStart } from "@/lib/campaign-sender";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id } = await params;
  const campaignId = parseInt(id, 10);

  if (isNaN(campaignId)) {
    return NextResponse.json(
      { error: "Invalid campaign ID" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const nextStatus = typeof body.status === "string" ? body.status.trim() : "";

  if (!nextStatus) {
    return NextResponse.json(
      { error: "Campaign status is required" },
      { status: 400 }
    );
  }

  if (nextStatus !== "active" && nextStatus !== "draft") {
    return NextResponse.json(
      { error: "Status must be either 'draft' or 'active'" },
      { status: 400 }
    );
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      userId: authResult.user.id,
    },
    include: {
      _count: {
        select: {
          leads: true,
        },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  if (nextStatus === "active" && campaign._count.leads < 1) {
    return NextResponse.json(
      { error: "Add leads before publishing this campaign." },
      { status: 400 }
    );
  }

  if (nextStatus === "active") {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "active",
        sendError: null,
      },
    });

    const startResult = await scheduleCampaignStart(campaignId, authResult.user.id);
    const refreshed = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    return NextResponse.json({
      ...refreshed,
      started: true,
      immediateSent: startResult.sent,
      nextSendAt: startResult.nextSendAt,
    });
  }

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: "draft",
      nextSendAt: null,
      sendError: null,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id } = await params;
  const campaignId = parseInt(id, 10);

  if (isNaN(campaignId)) {
    return NextResponse.json(
      { error: "Invalid campaign ID" },
      { status: 400 }
    );
  }

  const deleted = await prisma.campaign.deleteMany({
    where: {
      id: campaignId,
      userId: authResult.user.id,
    },
  });

  if (deleted.count > 0) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json(
    { error: "Campaign not found" },
    { status: 404 }
  );
}
