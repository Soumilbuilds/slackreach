import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "slakreach_session";

const PUBLIC_PAGE_PATHS = new Set<string>(["/access"]);
const PUBLIC_API_PREFIXES = ["/api/auth/users", "/api/auth/login", "/api/stripe/webhook", "/api/whop/webhook", "/api/cron"];

const isStaticAsset = (pathname: string): boolean =>
  pathname.startsWith("/_next") ||
  pathname.startsWith("/favicon.ico") ||
  pathname.startsWith("/public") ||
  /\.[a-zA-Z0-9]+$/.test(pathname);

const isPublicApiPath = (pathname: string): boolean =>
  PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (pathname.startsWith("/api")) {
    if (isPublicApiPath(pathname)) {
      return NextResponse.next();
    }

    if (!hasSession) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGE_PATHS.has(pathname);

  if (!hasSession && !isPublicPage) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/access";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
