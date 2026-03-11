import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const authResult = await requireApiUser(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const accounts = await prisma.account.findMany({
    where: {
      userId: authResult.user.id,
      campaigns: {
        none: {
          campaign: {
            status: { not: "draft" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(accounts);
}
