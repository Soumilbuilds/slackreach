import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  applySessionCookie,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";

const normalizeEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const normalizePassword = (value: unknown): string =>
  typeof value === "string" ? value : "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = normalizePassword(body.password);

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    let isValidPassword = false;
    try {
      isValidPassword = verifyPassword(password, user.passwordHash);
    } catch {
      isValidPassword = false;
    }

    if (!isValidPassword) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const token = createSessionToken({ userId: user.id, email: user.email });
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
    });

    applySessionCookie(response, token);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected login error.";

    if (message.toLowerCase().includes("no such table")) {
      return NextResponse.json(
        {
          error:
            "Auth database not initialized. Restart server and run migrations.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: "Login failed. Please retry." }, { status: 500 });
  }
}
