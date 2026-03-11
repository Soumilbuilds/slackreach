import prisma from "@/lib/db";
import {
  buildCookieHeaderFromJson,
  hasExistingConversation,
  resolveXoxcToken,
  sendSlackDirectMessage,
} from "@/lib/slack";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

// In-process lock – prevents overlapping polling cycles from racing.
// PM2 runs a single Node instance so this is sufficient.
let _processingLock = false;

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

/** Return a random delay in ms between the campaign's min and max seconds. */
const getRandomDelayMs = (minSeconds: number, maxSeconds: number): number => {
  const min = Math.max(10, minSeconds) * 1000;
  const max = Math.max(min, maxSeconds * 1000);
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

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

export async function processCampaignNow(
  campaignId: number,
  userId?: number
): Promise<{ sent: number; nextSendAt: Date | null }> {
  const now = new Date();

  const campaign =
    typeof userId === "number"
      ? await prisma.campaign.findFirst({
          where: {
            id: campaignId,
            userId,
          },
          include: {
            messages: { orderBy: { sortOrder: "asc" } },
            accounts: {
              include: {
                account: true,
              },
            },
            leads: {
              where: {
                status: "pending",
              },
              include: {
                lead: true,
              },
              orderBy: {
                createdAt: "asc",
              },
              take: 1,
            },
          },
        })
      : await prisma.campaign.findUnique({
          where: { id: campaignId },
          include: {
            messages: { orderBy: { sortOrder: "asc" } },
            accounts: {
              include: {
                account: true,
              },
            },
            leads: {
              where: {
                status: "pending",
              },
              include: {
                lead: true,
              },
              orderBy: {
                createdAt: "asc",
              },
              take: 1,
            },
          },
        });

  if (!campaign || campaign.status !== "active") {
    return { sent: 0, nextSendAt: null };
  }

  if (campaign.accounts.length < 1 || campaign.messages.length < 1) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        sendError: "Campaign needs at least one account and one message.",
        nextSendAt: null,
      },
    });

    return { sent: 0, nextSendAt: null };
  }

  const pendingLeadEntry = campaign.leads[0];

  if (!pendingLeadEntry?.lead) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        nextSendAt: null,
        sendError: null,
      },
    });

    return { sent: 0, nextSendAt: null };
  }

  // ── Atomic check-and-claim ──────────────────────────────────────────
  // Only dedup within the SAME campaign. Cross-campaign contacts are
  // intentionally allowed (different account / different product).
  const claimed = await prisma.$transaction(async (tx) => {
    // Check for in-flight "sending" or already "sent" records within
    // THIS campaign only (handles race conditions within the same cycle).
    const alreadyHandled = await tx.campaignLead.findFirst({
      where: {
        campaignId: campaign.id,
        status: { in: ["sent", "sending"] },
        lead: { slackUserId: pendingLeadEntry.lead.slackUserId },
      },
      select: { id: true },
    });

    if (alreadyHandled) {
      await tx.campaignLead.update({
        where: { id: pendingLeadEntry.id },
        data: {
          status: "skipped",
          errorMessage: "Already messaged in this campaign.",
        },
      });
      return false;
    }

    // Atomically flip from "pending" → "sending".
    // If another process already flipped it, count === 0 → skip.
    const updated = await tx.campaignLead.updateMany({
      where: { id: pendingLeadEntry.id, status: "pending" },
      data: { status: "sending" },
    });

    return updated.count > 0;
  });

  if (!claimed) {
    // Either already sent or claimed by another concurrent process
    const nextSendAt = new Date();
    await setCampaignNextSend(campaignId, nextSendAt, campaign.userId);
    return { sent: 0, nextSendAt };
  }

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

    return { sent: 0, nextSendAt: null };
  }

  // Use the campaign's random delay range, with dmsPerDay as a safety cap
  const maxIntervalMs = getIntervalMs(campaign.dmsPerDay);
  const randomDelayMs = getRandomDelayMs(
    campaign.minDelaySeconds ?? 60,
    campaign.maxDelaySeconds ?? 180
  );
  // Use whichever is smaller: random delay or the dmsPerDay-derived interval
  const intervalMs = Math.min(randomDelayMs, maxIntervalMs);
  const nextSendAt = new Date(now.getTime() + intervalMs);

  try {
    const cookieHeader = buildCookieHeaderFromJson(account.cookies);
    const teamId = pendingLeadEntry.lead.teamId;
    const token = await resolveXoxcToken({
      workspaceUrl: account.workspaceUrl ?? `https://app.slack.com/client/${teamId}`,
      teamId,
      cookieHeader,
      cookiesJson: account.cookies,
      accountWorkspaceUrl: account.workspaceUrl,
    });

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
            errorMessage: "Skipped — this account has an existing Slack conversation with this lead.",
          },
        });

        const skipNextSendAt = new Date();
        await setCampaignNextSend(campaignId, skipNextSendAt, campaign.userId);
        return { sent: 0, nextSendAt: skipNextSendAt };
      }
    }

    const sendResult = await sendSlackDirectMessage({
      token,
      cookieHeader,
      userId: pendingLeadEntry.lead.slackUserId,
      text,
    });

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

    return { sent: 1, nextSendAt };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error while sending campaign DM.";

    await prisma.$transaction([
      prisma.campaignLead.update({
        where: { id: pendingLeadEntry.id },
        data: {
          status: "pending",
          errorMessage: message,
        },
      }),
      prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          sendError: message,
          nextSendAt,
        },
      }),
    ]);

    return { sent: 0, nextSendAt };
  }
}

export async function processDueCampaigns(userId?: number): Promise<{
  processed: number;
  sent: number;
}> {
  // ── In-process lock ─────────────────────────────────────────────────
  // If a previous polling cycle is still running, skip this one entirely
  // so we never have two concurrent cycles racing over the same leads.
  if (_processingLock) {
    return { processed: 0, sent: 0 };
  }

  _processingLock = true;

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

    const dueCampaigns = await prisma.campaign.findMany({
      where: {
        ...(typeof userId === "number" ? { userId } : {}),
        status: "active",
        OR: [{ nextSendAt: null }, { nextSendAt: { lte: now } }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    let sent = 0;

    for (const campaign of dueCampaigns) {
      const result = await processCampaignNow(campaign.id, userId);
      sent += result.sent;
    }

    return {
      processed: dueCampaigns.length,
      sent,
    };
  } finally {
    _processingLock = false;
  }
}

export async function scheduleCampaignStart(
  campaignId: number,
  userId?: number
): Promise<{ sent: number; nextSendAt: Date | null }> {
  const now = new Date();

  await setCampaignNextSend(campaignId, now, userId);

  return processCampaignNow(campaignId, userId);
}
