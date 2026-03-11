"use client";

import { useMemo, useState } from "react";

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
  account: {
    id: number;
    nickname: string;
  };
}

interface CampaignOption {
  id: number;
  name: string;
  status: string;
}

interface Props {
  leadLists: LeadListItem[];
  campaigns: CampaignOption[];
  isLoading: boolean;
  onScrape: (listId: number) => Promise<void>;
  onDelete: (listId: number) => Promise<void>;
  onDownload: (listId: number) => void;
  onAddToCampaign: (listId: number, campaignId: number) => Promise<void>;
}

const statusBadgeClass: Record<LeadListItem["status"], string> = {
  pending: "bg-gray-100 text-gray-700",
  scraping: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

export default function LeadListTable({
  leadLists,
  campaigns,
  isLoading,
  onScrape,
  onDelete,
  onDownload,
  onAddToCampaign,
}: Props) {
  const [selectedCampaignByList, setSelectedCampaignByList] = useState<
    Record<number, number>
  >({});

  const hasCampaignOptions = useMemo(() => campaigns.length > 0, [campaigns]);

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading lead lists...</div>;
  }

  if (leadLists.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-12 text-center">
        No lead lists yet. Add a list to start scraping.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Workspace
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Channel
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Count
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Account
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {leadLists.map((list) => {
            const selectedCampaign = selectedCampaignByList[list.id] ?? 0;

            return (
              <tr key={list.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900 max-w-64 truncate">
                    {list.workspaceUrl}
                  </div>
                  <div className="text-xs text-gray-500">Team {list.teamId}</div>
                </td>

                <td className="px-4 py-3 text-sm text-gray-700">{list.channelId}</td>

                <td className="px-4 py-3 text-sm text-gray-700">
                  {list.scrapedCount}/{list.requestedCount}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass[list.status]}`}
                  >
                    {list.status}
                  </span>
                  {list.errorMessage && (
                    <div className="text-xs text-red-600 mt-1 max-w-48 line-clamp-2">
                      {list.errorMessage}
                    </div>
                  )}
                </td>

                <td className="px-4 py-3 text-sm text-gray-700">{list.account.nickname}</td>

                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => void onScrape(list.id)}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-gray-900 rounded hover:bg-gray-800 transition-colors"
                    >
                      {list.status === "completed" ? "Re-scrape" : "Scrape"}
                    </button>

                    <button
                      onClick={() => onDownload(list.id)}
                      disabled={list.scrapedCount === 0}
                      className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Download CSV
                    </button>

                    <select
                      value={selectedCampaign}
                      onChange={(event) =>
                        setSelectedCampaignByList((previous) => ({
                          ...previous,
                          [list.id]: Number.parseInt(event.target.value, 10) || 0,
                        }))
                      }
                      disabled={!hasCampaignOptions}
                      className="px-2 py-1 text-xs border border-gray-300 rounded text-gray-700 bg-white min-w-36"
                    >
                      <option value={0}>Select Campaign</option>
                      {campaigns.map((campaign) => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name} ({campaign.status})
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => void onAddToCampaign(list.id, selectedCampaign)}
                      disabled={list.scrapedCount === 0 || selectedCampaign === 0}
                      className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Add to Campaign
                    </button>

                    <button
                      onClick={() => void onDelete(list.id)}
                      className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
