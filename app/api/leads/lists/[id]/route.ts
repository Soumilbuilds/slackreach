import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireApiUser } from "@/lib/auth";

export async function DELETE(
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

  const deleted = await prisma.leadList.deleteMany({
    where: {
      id: listId,
      userId: authResult.user.id,
    },
  });

  if (deleted.count > 0) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "List not found" }, { status: 404 });
}
