"use client";

import { useCallback, useEffect, useState } from "react";
import AddLeadListModal from "@/components/leads/AddLeadListModal";
import LeadListTable from "@/components/leads/LeadListTable";

interface CampaignOption {
  id: number;
  name: string;
  status: string;
}

interface LeadListItem {
  id: number;
  workspaceUrl: string;
  teamId: string;
  channelId: string;
  requestedCount: number;
  scrapedCount: number;
  status: "pending" | "scraping" | "completed" | "failed";
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  account: {
    id: number;
    nickname: string;
  };
  leadCount: number;
}

interface CreateLeadListInput {
  workspaceUrl: string;
  channelId: string;
  requestedCount: number;
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
};

export default function LeadsPage() {
  const [leadLists, setLeadLists] = useState<LeadListItem[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const [listsResponse, campaignsResponse] = await Promise.all([
        fetch("/api/leads/lists"),
        fetch("/api/campaigns"),
      ]);

      if (!listsResponse.ok) {
        throw new Error(await parseApiError(listsResponse));
      }

      if (!campaignsResponse.ok) {
        throw new Error(await parseApiError(campaignsResponse));
      }

      const listsData = (await listsResponse.json()) as LeadListItem[];
      const campaignsData = (await campaignsResponse.json()) as CampaignOption[];

      setLeadLists(listsData);
      setCampaigns(
        campaignsData.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
        }))
      );
    } catch (fetchError) {
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Failed to load leads data.";
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Poll every 4s while any list is still scraping so progress shows live
  useEffect(() => {
    const hasActiveScrapers = leadLists.some(
      (l) => l.status === "pending" || l.status === "scraping"
    );
    if (!hasActiveScrapers) return;

    const id = setInterval(() => void fetchData(), 4000);
    return () => clearInterval(id);
  }, [leadLists, fetchData]);

  const createAndScrapeList = async (input: CreateLeadListInput) => {
    setInfoMessage("");
    setErrorMessage("");

    const createResponse = await fetch("/api/leads/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!createResponse.ok) {
      throw new Error(await parseApiError(createResponse));
    }

    const created = (await createResponse.json()) as { id: number };

    // Close modal immediately — scraping happens in the background
    setIsModalOpen(false);
    setInfoMessage("Scraping in progress...");
    await fetchData();

    // Fire-and-forget: kick off the scrape, then refresh
    fetch(`/api/leads/lists/${created.id}/scrape`, { method: "POST" })
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as { scrapedCount: number };
          setInfoMessage(`Scraping completed. ${data.scrapedCount} leads saved.`);
        } else {
          setErrorMessage(await parseApiError(res));
        }
        await fetchData();
      })
      .catch(() => {
        setErrorMessage("Scraping failed. Please try again.");
        void fetchData();
      });
  };

  const handleScrape = async (listId: number) => {
    setInfoMessage("");
    setErrorMessage("");

    const response = await fetch(`/api/leads/lists/${listId}/scrape`, {
      method: "POST",
    });

    if (!response.ok) {
      setErrorMessage(await parseApiError(response));
      return;
    }

    const data = (await response.json()) as { scrapedCount: number };
    setInfoMessage(`Scraping completed. ${data.scrapedCount} leads saved.`);
    await fetchData();
  };

  const handleDelete = async (listId: number) => {
    setInfoMessage("");
    setErrorMessage("");

    const response = await fetch(`/api/leads/lists/${listId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setErrorMessage(await parseApiError(response));
      return;
    }

    setInfoMessage("Lead list deleted.");
    await fetchData();
  };

  const handleDownload = (listId: number) => {
    window.location.href = `/api/leads/lists/${listId}/download`;
  };

  const handleAddToCampaign = async (listId: number, campaignId: number) => {
    if (!campaignId) {
      setErrorMessage("Select a campaign first.");
      return;
    }

    setInfoMessage("");
    setErrorMessage("");

    const response = await fetch(`/api/leads/lists/${listId}/add-to-campaign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });

    if (!response.ok) {
      setErrorMessage(await parseApiError(response));
      return;
    }

    const data = (await response.json()) as {
      added: number;
      total: number;
      listDeleted?: boolean;
    };
    const addedLabel = `${data.added} lead${data.added !== 1 ? "s" : ""}`;
    const deletedSuffix = data.listDeleted
      ? " Lead list deleted automatically."
      : "";

    setInfoMessage(`Added ${addedLabel} to campaign.${deletedSuffix}`);
    await fetchData();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Leads</h2>
        <div className="flex items-center gap-2">
          <a
            href="https://slofile.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Database
          </a>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          >
            Add List
          </button>
        </div>
      </div>

      {infoMessage && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {infoMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <LeadListTable
        leadLists={leadLists}
        campaigns={campaigns}
        isLoading={isLoading}
        onScrape={handleScrape}
        onDelete={handleDelete}
        onDownload={handleDownload}
        onAddToCampaign={handleAddToCampaign}
      />

      {isModalOpen && (
        <AddLeadListModal
          onClose={() => setIsModalOpen(false)}
          onCreate={createAndScrapeList}
        />
      )}
    </div>
  );
}
