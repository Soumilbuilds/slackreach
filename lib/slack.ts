const SLACK_EDGE_API_BASE = "https://edgeapi.slack.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface CookieInput {
  name?: string;
  value?: string;
}

interface SlackProfile {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  display_name_normalized?: string;
  real_name?: string;
  title?: string;
  image_original?: string;
  image_512?: string;
  image_192?: string;
  image_72?: string;
}

interface SlackUser {
  id?: string;
  team_id?: string;
  name?: string;
  real_name?: string;
  deleted?: boolean;
  is_bot?: boolean;
  is_app_user?: boolean;
  tz?: string;
  profile?: SlackProfile;
}

interface SlackUsersListResponse {
  ok?: boolean;
  error?: string;
  next_marker?: string;
  results?: SlackUser[];
}

export interface ScrapedLead {
  slackUserId: string;
  teamId: string;
  username: string;
  realName: string;
  displayName: string | null;
  firstName: string;
  lastName: string | null;
  title: string | null;
  timezone: string | null;
  avatarUrl: string | null;
  profileRaw: string;
}

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseCookiesJson = (cookiesJson: string): CookieInput[] => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(cookiesJson);
  } catch {
    throw new Error("Account cookies are not valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Account cookies must be a JSON array.");
  }

  return parsed as CookieInput[];
};

export const buildCookieHeaderFromJson = (cookiesJson: string): string => {
  const cookiePairs = parseCookiesJson(cookiesJson)
    .map((cookie) => {
      const name = asNonEmptyString(cookie?.name);
      const value = asNonEmptyString(cookie?.value);

      if (!name || !value) {
        return null;
      }

      return `${name}=${value}`;
    })
    .filter((pair): pair is string => pair !== null);

  if (cookiePairs.length === 0) {
    throw new Error("No usable cookies found in account.");
  }

  return cookiePairs.join("; ");
};

export const extractTeamIdFromWorkspaceUrl = (
  workspaceUrl: string
): string | null => {
  const parsedUrl = safeParseUrl(workspaceUrl);
  if (!parsedUrl) {
    return null;
  }

  const pathMatch = parsedUrl.pathname.match(/\/client\/(T[A-Z0-9]+)/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].toUpperCase();
  }

  return null;
};

const extractTeamIdFromText = (content: string): string | null => {
  const patterns = [
    /\/client\/(T[A-Z0-9]{8,})(?:\/|["'?#])/i,
    /["']team_id["']\s*:\s*["'](T[A-Z0-9]{8,})["']/i,
    /["']team["']\s*:\s*["'](T[A-Z0-9]{8,})["']/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
};

export const isSlackWorkspaceUrl = (workspaceUrl: string): boolean => {
  const parsedUrl = safeParseUrl(workspaceUrl);
  if (!parsedUrl) {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  return hostname === "app.slack.com" || hostname.endsWith(".slack.com");
};

const safeParseUrl = (workspaceUrl: string): URL | null => {
  try {
    return new URL(workspaceUrl);
  } catch {
    return null;
  }
};

const extractXoxcFromText = (content: string): string | null => {
  const tokenMatch = content.match(/xoxc-[A-Za-z0-9-]+/);
  return tokenMatch ? tokenMatch[0] : null;
};

const scrapeScriptSourcesFromHtml = (html: string): string[] => {
  const scriptUrls: string[] = [];
  const scriptRegex = /<script[^>]+src=["']([^"']+)["'][^>]*>/g;
  let match: RegExpExecArray | null = null;

  while ((match = scriptRegex.exec(html)) !== null) {
    if (match[1]) {
      scriptUrls.push(match[1]);
    }
  }

  return scriptUrls;
};

const normalizeScriptUrl = (scriptUrl: string, baseUrl: string): string => {
  try {
    return new URL(scriptUrl, baseUrl).toString();
  } catch {
    return scriptUrl;
  }
};

const requestRedirectLocationWithCookies = async (
  url: string,
  cookieHeader: string
): Promise<string | null> => {
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Cookie: cookieHeader,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });

    const location = response.headers.get("location");
    return asNonEmptyString(location);
  } catch {
    return null;
  }
};

const requestHtmlWithCookies = async (
  url: string,
  cookieHeader: string
): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Cookie: cookieHeader,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return response.text();
};

const requestTextWithCookies = async (
  url: string,
  cookieHeader: string
): Promise<string | null> => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        Cookie: cookieHeader,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  return response.text();
};

export const resolveTeamIdForWorkspace = async (params: {
  workspaceUrl: string;
  cookieHeader: string;
}): Promise<string | null> => {
  const { workspaceUrl, cookieHeader } = params;

  const direct = extractTeamIdFromWorkspaceUrl(workspaceUrl);
  if (direct) {
    return direct;
  }

  const parsedUrl = safeParseUrl(workspaceUrl);
  if (!parsedUrl) {
    return null;
  }

  const candidateUrls = Array.from(
    new Set([
      workspaceUrl,
      `https://${parsedUrl.hostname}/`,
      "https://app.slack.com/client",
    ])
  );

  for (const candidateUrl of candidateUrls) {
    const location = await requestRedirectLocationWithCookies(
      candidateUrl,
      cookieHeader
    );
    if (location) {
      const normalizedLocation = normalizeScriptUrl(location, candidateUrl);
      const locationTeamId = extractTeamIdFromText(normalizedLocation);
      if (locationTeamId) {
        return locationTeamId;
      }
    }

    const html = await requestHtmlWithCookies(candidateUrl, cookieHeader);
    if (!html) {
      continue;
    }

    const htmlTeamId = extractTeamIdFromText(html);
    if (htmlTeamId) {
      return htmlTeamId;
    }

    const scriptSources = scrapeScriptSourcesFromHtml(html)
      .map((src) => normalizeScriptUrl(src, candidateUrl))
      .slice(0, 8);

    for (const scriptUrl of scriptSources) {
      const scriptText = await requestTextWithCookies(scriptUrl, cookieHeader);
      if (!scriptText) {
        continue;
      }

      const scriptTeamId = extractTeamIdFromText(scriptText);
      if (scriptTeamId) {
        return scriptTeamId;
      }
    }
  }

  return null;
};

export const resolveXoxcToken = async (params: {
  workspaceUrl: string;
  teamId: string;
  channelId?: string;
  cookieHeader: string;
  cookiesJson?: string;
  accountWorkspaceUrl?: string | null;
}): Promise<string> => {
  const {
    workspaceUrl,
    teamId,
    channelId,
    cookieHeader,
    cookiesJson,
    accountWorkspaceUrl,
  } = params;

  // Check in-memory cache first
  const { getCachedToken, setCachedToken } = await import(
    "@/lib/token-extractor"
  );
  const cacheKey = `${teamId}`;
  const cached = getCachedToken(cacheKey);
  if (cached) {
    return cached;
  }

  // 1) Try fast static HTML extraction first
  const candidates = Array.from(
    new Set(
      [
        workspaceUrl,
        channelId
          ? `https://app.slack.com/client/${teamId}/${channelId}`
          : null,
        `https://app.slack.com/client/${teamId}`,
      ].filter((candidate): candidate is string => Boolean(candidate))
    )
  );

  for (const candidate of candidates) {
    const html = await requestHtmlWithCookies(candidate, cookieHeader);
    if (!html) {
      continue;
    }

    const directMatch = extractXoxcFromText(html);
    if (directMatch) {
      setCachedToken(cacheKey, directMatch);
      return directMatch;
    }

    const scriptSources = scrapeScriptSourcesFromHtml(html)
      .map((src) => normalizeScriptUrl(src, candidate))
      .slice(0, 12);

    for (const scriptUrl of scriptSources) {
      const scriptText = await requestTextWithCookies(scriptUrl, cookieHeader);
      if (!scriptText) {
        continue;
      }

      const scriptMatch = extractXoxcFromText(scriptText);
      if (scriptMatch) {
        setCachedToken(cacheKey, scriptMatch);
        return scriptMatch;
      }
    }
  }

  // 2) Fall back to browser automation (Playwright)
  if (cookiesJson) {
    const { extractXoxcTokenViaBrowser } = await import(
      "@/lib/token-extractor"
    );
    const token = await extractXoxcTokenViaBrowser({
      cookiesJson,
      teamId,
      workspaceUrl: accountWorkspaceUrl ?? undefined,
    });
    setCachedToken(cacheKey, token);
    return token;
  }

  throw new Error(
    "Unable to extract xoxc token. Please update your account cookies."
  );
};

interface SlackApiResponse {
  ok?: boolean;
  error?: string;
}

interface SlackConversationsOpenResponse extends SlackApiResponse {
  channel?: {
    id?: string;
  };
}

interface SlackChatPostMessageResponse extends SlackApiResponse {
  ts?: string;
  channel?: string;
}

const parseSlackError = (payload: SlackApiResponse): string =>
  payload.error ? ` (${payload.error})` : "";

export const sendSlackDirectMessage = async (params: {
  token: string;
  cookieHeader: string;
  userId: string;
  text: string;
}): Promise<{
  channelId: string;
  ts: string | null;
}> => {
  const { token, cookieHeader, userId, text } = params;

  const openBody = new URLSearchParams({
    token,
    users: userId,
    return_im: "true",
  });

  const openResponse = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: cookieHeader,
      Origin: "https://app.slack.com",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    body: openBody.toString(),
  });

  if (!openResponse.ok) {
    throw new Error(
      `Slack conversations.open failed with status ${openResponse.status}.`
    );
  }

  const openPayload = (await openResponse.json()) as SlackConversationsOpenResponse;

  if (!openPayload.ok) {
    throw new Error(
      `Slack conversations.open returned not ok${parseSlackError(openPayload)}.`
    );
  }

  const channelId = asNonEmptyString(openPayload.channel?.id);
  if (!channelId) {
    throw new Error("Slack conversations.open did not return a DM channel.");
  }

  const sendBody = new URLSearchParams({
    token,
    channel: channelId,
    text,
  });

  const sendResponse = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: cookieHeader,
      Origin: "https://app.slack.com",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    body: sendBody.toString(),
  });

  if (!sendResponse.ok) {
    throw new Error(
      `Slack chat.postMessage failed with status ${sendResponse.status}.`
    );
  }

  const sendPayload = (await sendResponse.json()) as SlackChatPostMessageResponse;

  if (!sendPayload.ok) {
    throw new Error(
      `Slack chat.postMessage returned not ok${parseSlackError(sendPayload)}.`
    );
  }

  return {
    channelId,
    ts: asNonEmptyString(sendPayload.ts),
  };
};

/**
 * Check whether there is any existing DM conversation history between the
 * authenticated account and a target Slack user.  Returns `true` when there
 * is at least one message (from either side) in the DM channel.
 */
export const hasExistingConversation = async (params: {
  token: string;
  cookieHeader: string;
  userId: string;
}): Promise<boolean> => {
  const { token, cookieHeader, userId } = params;

  // 1. Open (or retrieve) the DM channel with the target user.
  const openBody = new URLSearchParams({
    token,
    users: userId,
    return_im: "true",
  });

  const openResponse = await fetch("https://slack.com/api/conversations.open", {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: cookieHeader,
      Origin: "https://app.slack.com",
      "User-Agent": DEFAULT_USER_AGENT,
    },
    body: openBody.toString(),
  });

  if (!openResponse.ok) return false;

  const openPayload = (await openResponse.json()) as SlackConversationsOpenResponse;
  if (!openPayload.ok) return false;

  const channelId = asNonEmptyString(openPayload.channel?.id);
  if (!channelId) return false;

  // 2. Fetch up to 1 message from the conversation.
  const histBody = new URLSearchParams({
    token,
    channel: channelId,
    limit: "1",
    inclusive: "true",
    ignore_replies: "true",
  });

  const histResponse = await fetch(
    "https://slack.com/api/conversations.history",
    {
      method: "POST",
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Cookie: cookieHeader,
        Origin: "https://app.slack.com",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      body: histBody.toString(),
    }
  );

  if (!histResponse.ok) return false;

  const histPayload = (await histResponse.json()) as {
    ok: boolean;
    messages?: unknown[];
  };

  if (!histPayload.ok) return false;

  return Array.isArray(histPayload.messages) && histPayload.messages.length > 0;
};

const splitName = (name: string): { firstName: string; lastName: string | null } => {
  const normalized = name.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "there", lastName: null };
  }

  const parts = normalized.split(" ");
  const firstName = parts[0] || "there";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  return { firstName, lastName };
};

const mapSlackUserToLead = (user: SlackUser, fallbackTeamId: string): ScrapedLead | null => {
  const slackUserId = asNonEmptyString(user.id);
  if (!slackUserId) {
    return null;
  }

  if (user.deleted || user.is_bot || user.is_app_user) {
    return null;
  }

  const profile = user.profile;
  const profileFirstName = asNonEmptyString(profile?.first_name);
  const profileLastName = asNonEmptyString(profile?.last_name);

  const realName =
    asNonEmptyString(user.real_name) ||
    asNonEmptyString(profile?.real_name) ||
    asNonEmptyString(profile?.display_name) ||
    asNonEmptyString(user.name) ||
    "";

  const split = splitName(realName);

  const firstName = profileFirstName || split.firstName;
  const lastName = profileLastName || split.lastName;

  return {
    slackUserId,
    teamId: asNonEmptyString(user.team_id) || fallbackTeamId,
    username: asNonEmptyString(user.name) || "",
    realName,
    displayName:
      asNonEmptyString(profile?.display_name_normalized) ||
      asNonEmptyString(profile?.display_name),
    firstName,
    lastName,
    title: asNonEmptyString(profile?.title),
    timezone: asNonEmptyString(user.tz),
    avatarUrl:
      asNonEmptyString(profile?.image_original) ||
      asNonEmptyString(profile?.image_512) ||
      asNonEmptyString(profile?.image_192) ||
      asNonEmptyString(profile?.image_72),
    profileRaw: JSON.stringify(profile ?? {}),
  };
};

export const scrapeSlackLeads = async (params: {
  teamId: string;
  channelId: string;
  requestedCount: number;
  xoxcToken: string;
  cookieHeader: string;
}): Promise<ScrapedLead[]> => {
  const { teamId, channelId, requestedCount, xoxcToken, cookieHeader } = params;
  const targetCount = Math.max(1, Math.min(5000, Math.floor(requestedCount)));
  const leadsById = new Map<string, ScrapedLead>();

  let marker: string | undefined;

  while (leadsById.size < targetCount) {
    const remaining = targetCount - leadsById.size;
    const batchSize = Math.min(100, remaining);

    const payload: Record<string, unknown> = {
      token: xoxcToken,
      include_profile_only_users: true,
      count: batchSize,
      channels: [channelId],
      filter: "people",
      index: "users_by_display_name",
      locale: "en-US",
      present_first: false,
      fuzz: 1,
    };

    if (marker) {
      payload.marker = marker;
    }

    const response = await fetch(
      `${SLACK_EDGE_API_BASE}/cache/${teamId}/users/list?_x_app_name=client&fp=40&_x_num_retries=0`,
      {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "text/plain;charset=UTF-8",
          Cookie: cookieHeader,
          Origin: "https://app.slack.com",
          "User-Agent": DEFAULT_USER_AGENT,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`Slack scraping request failed with status ${response.status}.`);
    }

    const data = (await response.json()) as SlackUsersListResponse;

    if (!data.ok) {
      const reason = data.error ? ` (${data.error})` : "";
      throw new Error(`Slack users/list returned not ok${reason}.`);
    }

    const users = Array.isArray(data.results) ? data.results : [];

    for (const user of users) {
      const lead = mapSlackUserToLead(user, teamId);
      if (!lead) {
        continue;
      }

      if (!leadsById.has(lead.slackUserId)) {
        leadsById.set(lead.slackUserId, lead);
      }
    }

    marker = asNonEmptyString(data.next_marker) ?? undefined;

    if (!marker || users.length === 0) {
      break;
    }
  }

  return Array.from(leadsById.values()).slice(0, targetCount);
};
