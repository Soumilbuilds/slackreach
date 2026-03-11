"use client";

import { useEffect, useState, useCallback } from "react";
import CampaignList from "@/components/campaigns/CampaignList";
import CreateCampaignModal from "@/components/campaigns/CreateCampaignModal";

interface Campaign {
  id: number;
  name: string;
  status: string;
  dmsPerDay: number;
  createdAt: string;
  messages: { id: number; messageText: string; sortOrder: number }[];
  accounts: { account: { id: number; nickname: string } }[];
  _count: { leads: number };
  stats: {
    totalLeads: number;
    sentLeads: number;
    skippedLeads: number;
    uncontactedLeads: number;
  };
  nextSendAt: string | null;
  lastSentAt: string | null;
  sendError: string | null;
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || "Request failed.";
  } catch {
    return "Request failed.";
  }
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      const data = await res.json();
      setCampaigns(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const processDueCampaigns = useCallback(async () => {
    await fetch("/api/campaigns/process", { method: "POST" });
    await fetchCampaigns();
  }, [fetchCampaigns]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void processDueCampaigns();
    }, 15000);

    return () => clearInterval(intervalId);
  }, [processDueCampaigns]);

  const refreshCampaigns = async () => {
    setIsLoading(true);
    await fetchCampaigns();
  };

  const handleDelete = async (id: number) => {
    setInfoMessage("");
    setErrorMessage("");

    const response = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage(await parseApiError(response));
      return;
    }

    setInfoMessage("Campaign deleted.");
    await refreshCampaigns();
  };

  const handleStatusChange = async (
    id: number,
    status: "draft" | "active"
  ) => {
    setInfoMessage("");
    setErrorMessage("");

    const response = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      setErrorMessage(await parseApiError(response));
      return;
    }

    const payload = (await response.json()) as {
      immediateSent?: number;
      sendError?: string | null;
    };

    if (status === "active") {
      const immediateSent = payload.immediateSent ?? 0;
      if (immediateSent > 0) {
        setInfoMessage(`Campaign published. Sent ${immediateSent} DM immediately.`);
      } else if (payload.sendError) {
        setErrorMessage(
          `Campaign published, but immediate send failed: ${payload.sendError}`
        );
      } else {
        setInfoMessage("Campaign published. First DM is scheduled.");
      }
    } else {
      setInfoMessage("Campaign moved back to draft.");
    }

    await refreshCampaigns();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Campaigns
        </h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
        >
          Create Campaign
        </button>
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

      <CampaignList
        campaigns={campaigns}
        isLoading={isLoading}
        onDelete={handleDelete}
        onStatusChange={handleStatusChange}
      />

      {isModalOpen && (
        <CreateCampaignModal
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            void refreshCampaigns();
          }}
        />
      )}
    </div>
  );
}
