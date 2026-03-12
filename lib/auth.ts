import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const SESSION_COOKIE_NAME = "slakreach_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const resolveSessionSecret = (): string => {
  const configuredSecret = process.env.SESSION_SECRET;

  if (configuredSecret && configuredSecret !== "change-this-session-secret") {
    return configuredSecret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production. Refusing to use the default session secret."
    );
  }

  return "change-this-session-secret";
};

const SESSION_SECRET = resolveSessionSecret();

type SessionPayload = {
  uid: number;
  email: string;
  exp: number;
};

const toBase64Url = (value: string): string =>
  Buffer.from(value, "utf8").toString("base64url");

const fromBase64Url = (value: string): string =>
  Buffer.from(value, "base64url").toString("utf8");

const signToken = (payloadEncoded: string): string =>
  crypto.createHmac("sha256", SESSION_SECRET).update(payloadEncoded).digest("base64url");

export const hashPassword = (password: string): string => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derived.toString("hex")}`;
};

export const verifyPassword = (
  password: string,
  passwordHash: string
): boolean => {
  const [algorithm, salt, expectedHex] = passwordHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) {
    return false;
  }

  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");

  if (expected.length !== derived.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, derived);
};

export const createSessionToken = (params: {
  userId: number;
  email: string;
}): string => {
  const payload: SessionPayload = {
    uid: params.userId,
    email: params.email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = signToken(payloadEncoded);

  return `${payloadEncoded}.${signature}`;
};

export const verifySessionToken = (token: string): SessionPayload | null => {
  const [payloadEncoded, signature] = token.split(".");

  if (!payloadEncoded || !signature) {
    return null;
  }

  const expectedSignature = signToken(payloadEncoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  const isValidSignature = crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

  if (!isValidSignature) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadEncoded)) as SessionPayload;
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload.uid !== "number" ||
    typeof payload.email !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return null;
  }

  return payload;
};

export const applySessionCookie = (
  response: NextResponse,
  token: string
): void => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
};

export const clearSessionCookie = (response: NextResponse): void => {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
};

export type AuthenticatedUser = {
  id: number;
  email: string;
  whopMemberId: string | null;
  whopMembershipId: string | null;
  whopMembershipStatus: string | null;
  whopRenewalPeriodEnd: Date | null;
  whopCancelAtPeriodEnd: boolean;
  whopPlanId: string | null;
  whopProductId: string | null;
  whopPaymentMethodId: string | null;
  whopLastPaymentId: string | null;
  whopLastPaymentStatus: string | null;
  whopLastPaymentSubstatus: string | null;
  whopLastInvoiceId: string | null;
  whopLastInvoiceStatus: string | null;
  whopLastInvoiceToken: string | null;
  leadConnectorTrialStartedAt: Date | null;
  leadConnectorTrialStartedPaymentId: string | null;
  subscriptionPlanKey: string | null;
};

const mapUser = (user: {
  id: number;
  email: string;
  whopMemberId: string | null;
  whopMembershipId: string | null;
  whopMembershipStatus: string | null;
  whopRenewalPeriodEnd: Date | null;
  whopCancelAtPeriodEnd: boolean;
  whopPlanId: string | null;
  whopProductId: string | null;
  whopPaymentMethodId: string | null;
  whopLastPaymentId: string | null;
  whopLastPaymentStatus: string | null;
  whopLastPaymentSubstatus: string | null;
  whopLastInvoiceId: string | null;
  whopLastInvoiceStatus: string | null;
  whopLastInvoiceToken: string | null;
  leadConnectorTrialStartedAt: Date | null;
  leadConnectorTrialStartedPaymentId: string | null;
  subscriptionPlanKey: string | null;
}): AuthenticatedUser => ({
  id: user.id,
  email: user.email,
  whopMemberId: user.whopMemberId,
  whopMembershipId: user.whopMembershipId,
  whopMembershipStatus: user.whopMembershipStatus,
  whopRenewalPeriodEnd: user.whopRenewalPeriodEnd,
  whopCancelAtPeriodEnd: user.whopCancelAtPeriodEnd,
  whopPlanId: user.whopPlanId,
  whopProductId: user.whopProductId,
  whopPaymentMethodId: user.whopPaymentMethodId,
  whopLastPaymentId: user.whopLastPaymentId,
  whopLastPaymentStatus: user.whopLastPaymentStatus,
  whopLastPaymentSubstatus: user.whopLastPaymentSubstatus,
  whopLastInvoiceId: user.whopLastInvoiceId,
  whopLastInvoiceStatus: user.whopLastInvoiceStatus,
  whopLastInvoiceToken: user.whopLastInvoiceToken,
  leadConnectorTrialStartedAt: user.leadConnectorTrialStartedAt,
  leadConnectorTrialStartedPaymentId: user.leadConnectorTrialStartedPaymentId,
  subscriptionPlanKey: user.subscriptionPlanKey,
});

export const getCurrentUserFromRequest = async (
  request: NextRequest
): Promise<AuthenticatedUser | null> => {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      email: true,
      whopMemberId: true,
      whopMembershipId: true,
      whopMembershipStatus: true,
      whopRenewalPeriodEnd: true,
      whopCancelAtPeriodEnd: true,
      whopPlanId: true,
      whopProductId: true,
      whopPaymentMethodId: true,
      whopLastPaymentId: true,
      whopLastPaymentStatus: true,
      whopLastPaymentSubstatus: true,
      whopLastInvoiceId: true,
      whopLastInvoiceStatus: true,
      whopLastInvoiceToken: true,
      leadConnectorTrialStartedAt: true,
      leadConnectorTrialStartedPaymentId: true,
      subscriptionPlanKey: true,
    },
  });

  if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
    return null;
  }

  return mapUser(user);
};

export const getCurrentUserFromCookies = async (): Promise<AuthenticatedUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.uid },
    select: {
      id: true,
      email: true,
      whopMemberId: true,
      whopMembershipId: true,
      whopMembershipStatus: true,
      whopRenewalPeriodEnd: true,
      whopCancelAtPeriodEnd: true,
      whopPlanId: true,
      whopProductId: true,
      whopPaymentMethodId: true,
      whopLastPaymentId: true,
      whopLastPaymentStatus: true,
      whopLastPaymentSubstatus: true,
      whopLastInvoiceId: true,
      whopLastInvoiceStatus: true,
      whopLastInvoiceToken: true,
      leadConnectorTrialStartedAt: true,
      leadConnectorTrialStartedPaymentId: true,
      subscriptionPlanKey: true,
    },
  });

  if (!user || user.email.toLowerCase() !== payload.email.toLowerCase()) {
    return null;
  }

  return mapUser(user);
};

export const requireApiUser = async (
  request: NextRequest
): Promise<{ user: AuthenticatedUser } | NextResponse> => {
  const user = await getCurrentUserFromRequest(request);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return { user };
};
