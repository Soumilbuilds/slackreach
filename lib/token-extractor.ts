import { chromium } from "playwright";

interface CookieInput {
  name?: string;
  value?: string;
  domain?: string;
  path?: string;
  expires?: number;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

/* ------------------------------------------------------------------ */
/*  In-memory token cache (cacheKey → xoxc token)                      */
/* ------------------------------------------------------------------ */

const tokenCache = new Map<
  string,
  { token: string; extractedAt: number }
>();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export function getCachedToken(cacheKey: string): string | null {
  const entry = tokenCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.extractedAt > CACHE_TTL_MS) {
    tokenCache.delete(cacheKey);
    return null;
  }
  return entry.token;
}

export function setCachedToken(cacheKey: string, token: string): void {
  tokenCache.set(cacheKey, { token, extractedAt: Date.now() });
}

export function clearCachedToken(cacheKey: string): void {
  tokenCache.delete(cacheKey);
}

/* ------------------------------------------------------------------ */
/*  Cookie conversion                                                  */
/* ------------------------------------------------------------------ */

function normalizeSameSite(
  value?: string
): "Strict" | "Lax" | "None" {
  if (!value) return "None";
  const lower = value.toLowerCase();
  if (lower === "lax") return "Lax";
  if (lower === "strict") return "Strict";
  return "None";
}

function convertToPlaywrightCookies(cookiesJson: string) {
  const raw: CookieInput[] = JSON.parse(cookiesJson);

  return raw
    .filter((c) => c.name && c.value)
    .map((c) => ({
      name: c.name!,
      value: c.value!,
      domain: c.domain || ".slack.com",
      path: c.path || "/",
      expires: c.expirationDate ?? c.expires ?? -1,
      httpOnly: c.httpOnly ?? false,
      secure: c.secure ?? true,
      sameSite: normalizeSameSite(c.sameSite),
    }));
}

/* ------------------------------------------------------------------ */
/*  Browser-based xoxc extraction                                      */
/* ------------------------------------------------------------------ */

export async function extractXoxcTokenViaBrowser(params: {
  cookiesJson: string;
  teamId: string;
  workspaceUrl?: string;
}): Promise<string> {
  const { cookiesJson, teamId, workspaceUrl } = params;

  let cookies;
  try {
    cookies = convertToPlaywrightCookies(cookiesJson);
  } catch {
    throw new Error("Failed to parse account cookies for browser automation.");
  }

  if (cookies.length === 0) {
    throw new Error("No usable cookies found for browser automation.");
  }

  // Build list of URLs to try — workspace URL first (most reliable)
  const urlsToTry: string[] = [];
  if (workspaceUrl) {
    urlsToTry.push(workspaceUrl);
  }
  urlsToTry.push(`https://app.slack.com/client/${teamId}`);

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (err) {
    throw new Error(
      `Failed to launch browser. Make sure Playwright browsers are installed (npx playwright install chromium). ${
        err instanceof Error ? err.message : ""
      }`
    );
  }

  try {
    for (const targetUrl of urlsToTry) {
      const token = await tryExtractFromUrl(browser, cookies, targetUrl);
      if (token) return token;
    }

    throw new Error(
      "Unable to extract xoxc token via browser automation. Your cookies may be expired or invalid. Please re-export your Slack cookies from the browser and update the account."
    );
  } finally {
    await browser.close();
  }
}

async function tryExtractFromUrl(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  cookies: ReturnType<typeof convertToPlaywrightCookies>,
  targetUrl: string
): Promise<string | null> {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  try {
    await context.addCookies(cookies);
    const page = await context.newPage();

    // Track token from network responses
    let networkToken: string | null = null;

    page.on("response", async (response) => {
      if (networkToken) return;

      try {
        const contentType = response.headers()["content-type"] || "";
        if (
          !contentType.includes("json") &&
          !contentType.includes("javascript") &&
          !contentType.includes("html") &&
          !contentType.includes("text")
        ) {
          return;
        }

        const body = await response.text();
        const match = body.match(/xoxc-[A-Za-z0-9-]+/);
        if (match) {
          networkToken = match[0];
        }
      } catch {
        // Response body may not be available for some responses
      }
    });

    // Navigate to the URL
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Wait for network to settle
    await page
      .waitForLoadState("networkidle", { timeout: 10000 })
      .catch(() => {});

    // Check network responses first (fastest signal)
    if (networkToken) return networkToken;

    // Try to extract from window JS context
    const windowToken = await page
      .evaluate(() => {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const win = window as any;

        if (win.boot_data?.api_token) return win.boot_data.api_token as string;
        if (win.TS?.boot_data?.api_token)
          return win.TS.boot_data.api_token as string;

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          const val = localStorage.getItem(key);
          if (val?.includes("xoxc-")) {
            const m = val.match(/xoxc-[A-Za-z0-9-]+/);
            if (m) return m[0];
          }
        }

        const html = document.documentElement.innerHTML;
        const m = html.match(/xoxc-[A-Za-z0-9-]+/);
        return m ? m[0] : null;
        /* eslint-enable @typescript-eslint/no-explicit-any */
      })
      .catch(() => null);

    if (windowToken) return windowToken;
    if (networkToken) return networkToken;

    // Wait a bit more for late-loading content
    await page.waitForTimeout(3000);

    if (networkToken) return networkToken;

    return null;
  } finally {
    await context.close();
  }
}
