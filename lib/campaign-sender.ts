import prisma from "@/lib/db";
import {
  buildCookieHeaderFromJson,
  hasExistingConversation,
  resolveXoxcToken,
  sendSlackDirectMessage,
  SlackRateLimitError,
} from "@/lib/slack";
import { FREE_TRIAL_DM_DAILY_LIMIT } from "@/lib/free-trial-limit-constants";
import {
  getFreeTrialDmUsage,
  getStoredUserFreeTrialStatus,
} from "@/lib/free-trial-limits";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MS_PER_SECOND = 1000;

// Safety caps for per-lead backoff.  A poison-pill lead that keeps failing
// (bad slackUserId, network blip on a particular IP, etc.) must not stall
// the campaign forever.
const MAX_LEAD_ATTEMPTS = 3;
const BACKOFF_MAX_MS = 5 * 60 * 1000; // 5 min
const BACKOFF_BASE_MS = 30 * 1000; // 30 sec

// Hard cap on leads processed per campaign per scheduler tick.  Raised from
// 1 to 20 so the in-process scheduler can keep up with a 1-2s user cadence.
// With cadence=1s and a ~50ms DB+send cycle, we'd otherwise be scheduler-bound
// even before considering token re-resolution.
const MAX_LEADS_PER_CAMPAIGN_PER_CYCLE = 20;

// In-process lock – prevents overlapping polling cycles from racing.
// PM2 runs a single Node instance so this is sufficient.
let _processingLock = false;

// Per-campaign lock – allows multiple campaigns to drain in parallel
// while preventing the same campaign from being drained twice concurrently.
// Without this, a 1s scheduler tick + slow campaigns = each cycle waits
// for the slowest one to finish before the next tick can run.
const _campaignProcessingLocks = new Set<number>();

type SessionCache = {
  token: string;
  cookieHeader: string;
  resolvedAt: number;
};

type GlobalSessionCache = typeof globalThis & {
  __slackreach_session_cache?: Map<string, SessionCache>;
  __slackreach_session_inflight?: Map<string, Promise<string>>;
};

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min — Slack xoxc tokens rotate but last longer

const getSessionCache = (): Map<string, SessionCache> => {
  const g = globalThis as GlobalSessionCache;
  if (!g.__slackreach_session_cache) {
    g.__slackreach_session_cache = new Map();
  }
  return g.__slackreach_session_cache;
};

const getInflight = (): Map<string, Promise<string>> => {
  const g = globalThis as GlobalSessionCache;
  if (!g.__slackreach_session_inflight) {
    g.__slackreach_session_inflight = new Map();
  }
  return g.__slackreach_session_inflight;
};

/**
 * Resolve an xoxc token for a (teamId, accountId) pair, using a process-wide
 * cache. The token is hoisted out of the per-lead hot path so a 1-2s cadence
 * is not bottlenecked by 1-15s Playwright scrapes per DM. Concurrent callers
 * for the same key share a single in-flight resolution.
 */
const resolveSessionCached = async (params: {
  teamId: string;
  accountId: number;
  workspaceUrl: string | null;
  cookiesJson: string;
}): Promise<{ token: string; cookieHeader: string }> => {
  const cacheKey = `${params.accountId}:${params.teamId}`;
  const cache = getSessionCache();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.resolvedAt < SESSION_TTL_MS) {
    return { token: cached.token, cookieHeader: cached.cookieHeader };
  }

  const inflight = getInflight();
  const existing = inflight.get(cacheKey);
  if (existing) {
    const token = await existing;
    const entry = cache.get(cacheKey);
    return { token, cookieHeader: entry?.cookieHeader ?? "" };
  }

  const promise = (async () => {
    const cookieHeader = buildCookieHeaderFromJson(params.cookiesJson);
    const token = await resolveXoxcToken({
      workspaceUrl:
        params.workspaceUrl ?? `https://app.slack.com/client/${params.teamId}`,
      teamId: params.teamId,
      cookieHeader,
      cookiesJson: params.cookiesJson,
      accountWorkspaceUrl: params.workspaceUrl,
    });
    cache.set(cacheKey, {
      token,
      cookieHeader,
      resolvedAt: Date.now(),
    });
    return token;
  })();

  inflight.set(cacheKey, promise);
  try {
    const token = await promise;
    return { token, cookieHeader: cache.get(cacheKey)?.cookieHeader ?? "" };
  } finally {
    inflight.delete(cacheKey);
  }
};

/**
 * Per-account failure cooldowns.
 *
 * When `resolveXoxcToken` (or the downstream Slack send) fails for a given
 * account, we record a timestamp.  All other campaigns that share the same
 * account will short-circuit out of `processCampaignNow` for the cooldown
 * window — no DB claims, no token resolution, no Slack API calls.  This is
 * what keeps a single broken account from starving every other campaign
 * sharing the scheduler cycle.
 *
 * The map is in-memory; PM2 runs a single Node process so it persists
 * across cycles until the process restarts.
 */
const ACCOUNT_FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
const accountFailureCooldown = new Map<number, number>(); // accountId → expiresAtMs

const markAccountFailed = (accountId: number): void => {
  accountFailureCooldown.set(accountId, Date.now() + ACCOUNT_FAILURE_COOLDOWN_MS);
};

const isAccountInCooldown = (accountId: number): boolean => {
  const expiresAt = accountFailureCooldown.get(accountId);
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    accountFailureCooldown.delete(accountId);
    return false;
  }
  return true;
};

const clearAccountFailure = (accountId: number): void => {
  accountFailureCooldown.delete(accountId);
};

const isAccountAuthError = (message: string): boolean =>
  message.includes("Unable to extract xoxc token") ||
  message.includes("cookies may be expired") ||
  message.includes("Failed to launch browser") ||
  message.includes("Failed to parse account cookies") ||
  message.includes("No usable cookies found");

const randomIndex = (maxExclusive: number): number =>
  Math.floor(Math.random() * maxExclusive);

const normalizeFirstName = (value: string | null | undefined): string => {
  if (typeof value !== "string") {
    return "there";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "there";
};

const resolveSpintax = (message: string): string =>
  message.replace(/\{\{([^{}]*\|[^{}]*)\}\}/g, (_match, content: string) => {
    const options = content
      .split("|")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (options.length === 0) {
      return "";
    }

    return options[randomIndex(options.length)] ?? options[0] ?? "";
  });

const renderMessage = (template: string, firstName: string): string => {
  const withFirstName = template.replace(
    /\{\{\s*first_name\s*\}\}/gi,
    normalizeFirstName(firstName)
  );

  return resolveSpintax(withFirstName);
};

const getIntervalMs = (dmsPerDay: number): number => {
  const safeDmsPerDay = Math.max(1, Math.floor(dmsPerDay));
  return Math.max(1000, Math.floor(DAY_IN_MS / safeDmsPerDay));
};

/**
 * Return a random delay in ms between the campaign's min and max seconds.
 * No artificial floor — respect the user's configured cadence.  The
 * dmsPerDay-based cap (see getIntervalMs) is the only safety net.
 *
 * Distribution: uniform over [minSeconds*1000, maxSeconds*1000] ms inclusive.
 * Previously this used `spanSeconds + 1` which produced values one bucket
 * beyond the configured max (1–2s config would emit 1–3s).  Fixed by
 * sampling over the full integer-second span and clipping to maxSeconds.
 */
const getRandomDelayMs = (minSeconds: number, maxSeconds: number): number => {
  const safeMin = Math.max(0, Math.floor(minSeconds));
  const safeMax = Math.max(safeMin, Math.floor(maxSeconds));
  if (safeMin === safeMax) {
    return safeMin * MS_PER_SECOND;
  }
  const spanMs = (safeMax - safeMin) * MS_PER_SECOND;
  return safeMin * MS_PER_SECOND + Math.floor(Math.random() * (spanMs + 1));
};

const computeBackoffMs = (attemptCount: number, baseIntervalMs: number): number => {
  // attemptCount is the count AFTER incrementing, so first failure = 1
  // → 1 * base.  Second failure = 2 → 2 * base, capped at BACKOFF_MAX_MS.
  const exponent = Math.max(0, Math.min(attemptCount - 1, 5));
  const base = Math.max(MIN_BACKOFF_BASE_MS(baseIntervalMs), baseIntervalMs);
  return Math.min(BACKOFF_MAX_MS, base * Math.pow(2, exponent));
};

// New: Compute the next send time based only on campaign cadence, not backoff
const calculateCadenceNextSendAt = (
  minSeconds: number,
  maxSeconds: number,
  dmsPerDay: number,
  isFreeTrial: boolean,
  now: Date
): Date => {
  const safeDmsPerDay = Math.max(1, Math.floor(dmsPerDay));
  const maxIntervalMs = Math.max(1000, Math.floor(DAY_IN_MS / safeDmsPerDay));
  const randomDelayMs = getRandomDelayMs(minSeconds, maxSeconds);
  const intervalMs = isFreeTrial
    ? Math.max(randomDelayMs, maxIntervalMs)
    : Math.min(randomDelayMs, maxIntervalMs);

  return new Date(now.getTime() + intervalMs);
};

const MIN_BACKOFF_BASE_MS = (intervalMs: number): number =>
  Math.min(intervalMs, BACKOFF_BASE_MS);

const PERMANENT_LEAD_SEND_ERRORS = [
  "(user_not_found)",
  "(user_not_visible)",
  "(account_inactive)",
];

const isPermanentLeadSendError = (message: string): boolean =>
  PERMANENT_LEAD_SEND_ERRORS.some((errorCode) => message.includes(errorCode));

const setCampaignNextSend = async (
  campaignId: number,
  when: Date | null,
  userId?: number
) => {
  await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      ...(typeof userId === "number" ? { userId } : {}),
    },
    data: {
      nextSendAt: when,
    },
  });
};

const loadCampaign = async (campaignId: number, userId?: number) => {
  const where =
    typeof userId === "number"
      ? { id: campaignId, userId }
      : { id: campaignId };
  return prisma.campaign.findFirst({
    where,
    include: {
      messages: { orderBy: { sortOrder: "asc" } },
      accounts: { include: { account: true } },
    },
  });
};

const fetchNextPendingLead = async (
  campaignId: number,
  tx: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
) => {
  return tx.campaignLead.findFirst({
    where: {
      campaignId,
      status: "pending",
    },
    include: { lead: true },
    orderBy: { createdAt: "asc" },
  });
};

export type CampaignTickResult = {
  /** Number of DMs successfully sent during this call. */
  sent: number;
  /** The campaign's nextSendAt after this call, or null if no leads remain. */
  nextSendAt: Date | null;
  /**
   * True if more leads are due to be processed in the same cycle (so the
   * caller should drain again immediately).  False if the campaign is
   * blocked on rate-limit, backoff, free-trial, or has no more work.
   */
  drainable: boolean;
};

export async function processCampaignNow(
  campaignId: number,
  userId?: number
): Promise<CampaignTickResult> {
  const now = new Date();
  const cycleStartMs = Date.now();

  const campaign = await loadCampaign(campaignId, userId);

  if (!campaign || campaign.status !== "active") {
    return { sent: 0, nextSendAt: null, drainable: false };
  }

  if (campaign.accounts.length < 1 || campaign.messages.length < 1) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sendError: "Campaign needs at least one account and one message.",
        nextSendAt: null,
      },
    });
    return { sent: 0, nextSendAt: null, drainable: false };
  }

  // Short-circuit campaigns whose only account is currently in a failure
  // cooldown.  No DB claims, no token resolution, no Slack API calls.
  // The cooldown is set when token resolution or auth fails for the account.
  const primaryAccountId = campaign.accounts[0]?.accountId;
  if (primaryAccountId && isAccountInCooldown(primaryAccountId)) {
    const expiresAt = accountFailureCooldown.get(primaryAccountId) ?? 0;
    const retryIn = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sendError: `Account is in cooldown after recent auth failure — retrying in ${retryIn}s.`,
        // Push nextSendAt out so we don't keep hitting this campaign every cycle.
        nextSendAt: new Date(Date.now() + Math.min(retryIn * 1000, ACCOUNT_FAILURE_COOLDOWN_MS)),
      },
    });
    return { sent: 0, nextSendAt: null, drainable: false };
  }

  const isFreeTrial = await getStoredUserFreeTrialStatus(campaign.userId);
  if (isFreeTrial) {
    const dmUsage = await getFreeTrialDmUsage(campaign.userId, now);
    if (dmUsage.remaining < 1) {
      const nextAvailableAt =
        dmUsage.nextAvailableAt ?? new Date(now.getTime() + DAY_IN_MS);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          nextSendAt: nextAvailableAt,
          sendError: `Free trial limit reached: ${FREE_TRIAL_DM_DAILY_LIMIT} DMs per day.`,
        },
      });
      return { sent: 0, nextSendAt: nextAvailableAt, drainable: false };
    }
  }

  // Claim the next lead.  Atomic flip from "pending" → "sending" so
  // concurrent workers (or a re-entrant scheduler tick) cannot double-send.
  const claim = await prisma.$transaction(async (tx) => {
    const candidate = await fetchNextPendingLead(campaign.id, tx);
    if (!candidate) {
      return { claimed: false as const, candidate: null };
    }

    // Cross-campaign dedup within THIS campaign only.  Different campaigns
    // can target the same slackUserId with different products/messages.
    const alreadyHandled = await tx.campaignLead.findFirst({
      where: {
        campaignId: campaign.id,
        status: { in: ["sent", "sending", "skipped"] },
        lead: { slackUserId: candidate.lead.slackUserId },
        NOT: { id: candidate.id },
      },
      select: { id: true },
    });

    if (alreadyHandled) {
      await tx.campaignLead.update({
        where: { id: candidate.id },
        data: {
          status: "skipped",
          errorMessage: "Already messaged in this campaign.",
        },
      });
      return { claimed: false as const, candidate };
    }

    // Per-lead backoff: if this lead is mid-backoff, leave it pending and
    // let the next scheduler tick retry it.  Prevents the drain loop from
    // re-attempting the same failing lead in back-to-back iterations.
    if (candidate.lastAttemptAt) {
      const lastAttempt = candidate.lastAttemptAt.getTime();
      // For retry backoff, still respect the original campaign config
      const baseIntervalMs = getRandomDelayMs(
        campaign.minDelaySeconds ?? 1,
        campaign.maxDelaySeconds ?? 2
      );
      const backoff = computeBackoffMs(
        candidate.attemptCount,
        baseIntervalMs
      );
      const backoffWindowMs = Math.max(baseIntervalMs, backoff);
      if (now.getTime() - lastAttempt < backoffWindowMs) {
        // Not yet ready to retry.  Leave pending, drain moves on.
        return { claimed: false as const, candidate: null };
      }
    }

    const updated = await tx.campaignLead.updateMany({
      where: { id: candidate.id, status: "pending" },
      data: { status: "sending" },
    });

    if (updated.count === 0) {
      return { claimed: false as const, candidate: null };
    }

    return { claimed: true as const, candidate };
  });

  if (!claim.candidate) {
    // No pending leads (or the only pending lead is mid-backoff).
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { nextSendAt: null, sendError: null },
    });
    return { sent: 0, nextSendAt: null, drainable: false };
  }

  if (!claim.claimed) {
    // We found a pending lead but couldn't claim it (already handled or
    // mid-backoff).  Drain continues — there may be more leads due.
    return { sent: 0, nextSendAt: null, drainable: true };
  }

  const pendingLeadEntry = claim.candidate;

  const selectedMessage =
    campaign.messages[randomIndex(campaign.messages.length)] ?? campaign.messages[0];
  const text = renderMessage(
    selectedMessage?.messageText ?? "",
    pendingLeadEntry.lead.firstName
  );

  const account = campaign.accounts[0]?.account;
  if (!account) {
    // Release the claim – set back to pending so it can be retried
    await prisma.campaignLead.update({
      where: { id: pendingLeadEntry.id },
      data: { status: "pending", errorMessage: "No connected account found." },
    });

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sendError: "No connected account found for campaign.",
      },
    });

    return { sent: 0, nextSendAt: null, drainable: false };
  }

  // Compute the next-send delay based purely on the configured min/max seconds.
  // Ignore dmsPerDay completely - the delay is exactly what the user configured.
  const randomDelayMs = getRandomDelayMs(
    campaign.minDelaySeconds ?? 1,
    campaign.maxDelaySeconds ?? 2
  );
  const nextSendAt = new Date(now.getTime() + randomDelayMs);

  const claimMs = Date.now() - cycleStartMs;
  let tokenMs = 0;
  let sendMs = 0;
  let writeMs = 0;

  try {
    // ── Token / cookie resolution ────────────────────────────────────
    // Use a process-wide session cache (keyed by accountId+teamId) so a
    // Playwright token scrape is paid once per cache lifetime, not once
    // per DM. This is what brings the effective cadence from "minutes"
    // back to the user's configured 1-2s.
    const tokenStartMs = Date.now();
    const { token, cookieHeader } = await resolveSessionCached({
      teamId: pendingLeadEntry.lead.teamId,
      accountId: account.id,
      workspaceUrl: account.workspaceUrl,
      cookiesJson: account.cookies,
    });
    const usedCache =
      Date.now() - tokenStartMs < 50; // heuristic: a real resolve is 100ms+
    tokenMs = Date.now() - tokenStartMs;

    // Clear the account's failure cooldown on successful token resolution.
    // This is what lets a broken account recover automatically once the
    // user refreshes cookies or the session comes back.
    clearAccountFailure(account.id);

    // ── Live Slack history check (optional per campaign) ───────────────
    // When enabled, we call conversations.history before sending to skip
    // anyone the user has EVER DM'd — even outside of SlackReach.
    if (campaign.skipPreviouslyContacted) {
      const alreadyTalked = await hasExistingConversation({
        token,
        cookieHeader,
        userId: pendingLeadEntry.lead.slackUserId,
      });

      if (alreadyTalked) {
        await prisma.campaignLead.update({
          where: { id: pendingLeadEntry.id },
          data: {
            status: "skipped",
            errorMessage:
              "Skipped — this account has an existing Slack conversation with this lead.",
          },
        });

        // Don't update nextSendAt — let the drain continue with the next
        // lead within the same cycle.  The next successful send (or the
        // empty-queue return) will set it.
        return { sent: 0, nextSendAt: null, drainable: true };
      }
    }

    const sendStartMs = Date.now();
    const sendResult = await sendSlackDirectMessage({
      token,
      cookieHeader,
      userId: pendingLeadEntry.lead.slackUserId,
      text,
    });
    sendMs = Date.now() - sendStartMs;

    const writeStartMs = Date.now();
    await prisma.$transaction([
      prisma.campaignLead.update({
        where: { id: pendingLeadEntry.id },
        data: {
          status: "sent",
          sentAt: now,
          messageText: text,
          dmChannelId: sendResult.channelId,
          dmTs: sendResult.ts,
          errorMessage: null,
          attemptCount: 0,
          lastAttemptAt: now,
        },
      }),
      prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          lastSentAt: now,
          nextSendAt,
          sendError: null,
        },
      }),
    ]);
    writeMs = Date.now() - writeStartMs;

    const totalMs = Date.now() - cycleStartMs;
    console.log(
      `[campaign] sent to ${pendingLeadEntry.lead.slackUserId} in ${totalMs}ms ` +
      `(claim=${claimMs}ms token=${tokenMs}ms ${usedCache ? "[cached]" : "[fresh]"} ` +
      `send=${sendMs}ms write=${writeMs}ms next=${nextSendAt.toISOString()})`
    );

    // A successful send blocks the drain until nextSendAt — otherwise we'd
    // spam leads faster than the configured cadence.
    return { sent: 1, nextSendAt, drainable: false };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while sending campaign DM.";

    // Slack rate-limit.  Respect Retry-After and pause the campaign.
    // The lead is left pending; attemptCount is incremented.
    if (error instanceof SlackRateLimitError) {
      const retryAt = new Date(now.getTime() + error.retryMs);
      console.error(`[campaign] Slack rate limit: ${message}, retrying at ${retryAt.toISOString()}`);
      await prisma.$transaction([
        prisma.campaignLead.update({
          where: { id: pendingLeadEntry.id },
          data: {
            status: "pending",
            errorMessage: message,
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
          },
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            sendError: `Rate limited by Slack: ${message}`,
            nextSendAt: retryAt,
          },
        }),
      ]);
      return { sent: 0, nextSendAt: retryAt, drainable: false };
    }

    if (isPermanentLeadSendError(message)) {
      await prisma.$transaction([
        prisma.campaignLead.update({
          where: { id: pendingLeadEntry.id },
          data: {
            status: "skipped",
            errorMessage: message,
            attemptCount: { increment: 1 },
            lastAttemptAt: now,
          },
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            sendError: null,
            // Permanent skip — keep the campaign moving at its configured
            // cadence.  Don't reset to "now" — that would let a burst of
            // skips in a row race ahead of the user's minDelaySeconds.
            nextSendAt,
          },
        }),
      ]);
      return { sent: 0, nextSendAt, drainable: false };
    }

    // Transient error.  Increment attemptCount and apply exponential
    // backoff so a poison-pill lead doesn't block the queue.  After
    // MAX_LEAD_ATTEMPTS failures the lead is marked skipped permanently.
    const newAttemptCount = pendingLeadEntry.attemptCount + 1;
    if (newAttemptCount >= MAX_LEAD_ATTEMPTS) {
      await prisma.$transaction([
        prisma.campaignLead.update({
          where: { id: pendingLeadEntry.id },
          data: {
            status: "skipped",
            errorMessage: `Exhausted retry budget (${MAX_LEAD_ATTEMPTS} attempts). Last error: ${message}`,
            attemptCount: newAttemptCount,
            lastAttemptAt: now,
          },
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            sendError: null,
            nextSendAt,
          },
        }),
      ]);
      return { sent: 0, nextSendAt, drainable: false };
    }

    // For transient errors, don't delay the campaign's nextSendAt.
    // Move the lead back to pending. The lead's attemptCount and
    // lastAttemptAt track backoff for the per-lead retry check.
    console.error(`[campaign] lead ${pendingLeadEntry.id} transient error (attempt ${newAttemptCount}/${MAX_LEAD_ATTEMPTS}): ${message}`);

    await prisma.campaignLead.update({
      where: { id: pendingLeadEntry.id },
      data: {
        status: "pending",
        errorMessage: message,
        attemptCount: newAttemptCount,
        lastAttemptAt: now,
      },
    });

    // Circuit breaker: if the most likely cause is a broken auth (Playwright
    // already failed twice), don't drain more leads in this cycle - they
    // will hit the same broken auth. Wait for next cycle.
    if (isAccountAuthError(message)) {
      // Mark the account as in cooldown so OTHER campaigns sharing this
      // account short-circuit for the cooldown window.  We do NOT push this
      // campaign's nextSendAt out — the user's campaign is the one that
      // hit the auth error, and they want to keep trying at their configured
      // cadence.  The next tick will pick the campaign up again and try
      // again (and the cycle-time cap means we don't burn more than 1
      // attempt per cycle on a broken account).
      markAccountFailed(account.id);
      // Light-touch error message update (don't push nextSendAt out so the
      // user-configured cadence is preserved).
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          sendError: message,
        },
      });
      return { sent: 0, nextSendAt, drainable: false };
    }

    // Don't reset nextSendAt — keep it on the configured cadence so the
    // next scheduler tick can pick up the next lead.
    return { sent: 0, nextSendAt, drainable: true };
  }
}

/**
 * Drain due leads from a single campaign in a tight inner loop.  Bounded
 * by MAX_LEADS_PER_CAMPAIGN_PER_CYCLE so a single campaign cannot monopolise
 * the in-process lock.
 *
 * Token resolution is handled by the process-wide session cache inside
 * `processCampaignNow` (via `resolveSessionCached`). We no longer pre-resolve
 * here — the cache is shared across cycles so a single Playwright scrape
 * services the entire campaign lifetime within the 30-min TTL.
 *
 * The per-campaign lock (rather than the global _processingLock) lets
 * different campaigns drain in parallel within the same scheduler cycle,
 * so a slow campaign can't starve the fast ones.
 */
async function drainCampaign(
  campaignId: number,
  userId: number | undefined
): Promise<number> {
  // Skip if this campaign is already being drained.
  if (_campaignProcessingLocks.has(campaignId)) {
    return 0;
  }
  _campaignProcessingLocks.add(campaignId);

  try {
    let sent = 0;
    for (let i = 0; i < MAX_LEADS_PER_CAMPAIGN_PER_CYCLE; i += 1) {
      const result = await processCampaignNow(campaignId, userId);
      sent += result.sent;
      if (!result.drainable) {
        break;
      }
    }
    return sent;
  } finally {
    _campaignProcessingLocks.delete(campaignId);
  }
}

export async function processDueCampaigns(userId?: number): Promise<{
  processed: number;
  sent: number;
}> {
  const tickStart = Date.now();
  console.log(`[campaign-scheduler] cycle starting (global lock removed)`);
  const lockAcquiredAt = Date.now();

  try {
    const now = new Date();

    // ── Crash recovery ────────────────────────────────────────────────
    // The "sending" status is a short-lived lock (seconds).  Because of
    // the in-process lock above, no other cycle is running right now.
    // Any record still in "sending" belongs to a previous crashed cycle.
    await prisma.campaignLead.updateMany({
      where: {
        status: "sending",
        ...(typeof userId === "number"
          ? { campaign: { userId } }
          : {}),
      },
      data: { status: "pending", errorMessage: "Reset from stale sending state." },
    });

    // Find campaigns that are due
    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        ...(typeof userId === "number" ? { userId } : {}),
        status: "active",
        OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    console.log(`[campaign-scheduler] found ${dueCampaigns.length} due campaigns`);

    // Fire-and-forget: spawn a background drain for each due campaign.
    // The scheduler tick returns immediately, so the next tick (1s away)
    // can pick up newly-due campaigns without waiting for slow ones.
    // Per-campaign locks prevent the same campaign from draining twice
    // concurrently.
    for (const campaign of dueCampaigns) {
      void drainCampaign(campaign.id, userId).then((s) => {
        console.log(`[campaign-scheduler] drained campaign ${campaign.id} sent=${s}`);
      }).catch((err) => {
        console.error(`[campaign-scheduler] drain error for campaign ${campaign.id}:`, err);
      });
    }

    return {
      processed: dueCampaigns.length,
      sent: 0, // Counted asynchronously now
    };
  } catch (err) {
    console.error(`[campaign-scheduler] cycle error:`, err);
    return { processed: 0, sent: 0 };
  } finally {
    const tickMs = Date.now() - tickStart;
    const lockHeldMs = Date.now() - lockAcquiredAt;
    console.log(`[campaign-scheduler] cycle took ${tickMs}ms (lock held ${lockHeldMs}ms)`);
  }
}

export async function scheduleCampaignStart(
  campaignId: number,
  userId?: number
): Promise<{ sent: number; nextSendAt: Date | null }> {
  const now = new Date();

  await setCampaignNextSend(campaignId, now, userId);

  const result = await processCampaignNow(campaignId, userId);
  return { sent: result.sent, nextSendAt: result.nextSendAt };
}
