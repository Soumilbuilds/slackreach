"use client";

import { useState } from "react";

interface CreateLeadListInput {
  workspaceUrl: string;
  channelId: string;
  requestedCount: number;
}

interface Props {
  onClose: () => void;
  onCreate: (input: CreateLeadListInput) => Promise<void>;
}

export default function AddLeadListModal({ onClose, onCreate }: Props) {
  const [workspaceUrl, setWorkspaceUrl] = useState("");
  const [channelId, setChannelId] = useState("");
  const [requestedCount, setRequestedCount] = useState(100);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    setError("");

    if (!workspaceUrl.trim() || !channelId.trim()) {
      setError("Workspace URL and channel ID are required.");
      return;
    }

    if (!Number.isFinite(requestedCount) || requestedCount < 1) {
      setError("Requested count must be at least 1.");
      return;
    }

    setIsSubmitting(true);

    try {
      await onCreate({
        workspaceUrl: workspaceUrl.trim(),
        channelId: channelId.trim().toUpperCase(),
        requestedCount,
      });
    } catch (createError) {
      const message =
        createError instanceof Error ? createError.message : "Failed to create list.";
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Lead List</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workspace URL
            </label>
            <input
              type="url"
              value={workspaceUrl}
              onChange={(event) => setWorkspaceUrl(event.target.value)}
              placeholder="https://yourteam.slack.com/ or https://app.slack.com/client/TXXXX/CXXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Channel ID
            </label>
            <input
              type="text"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
              placeholder="CXXXXXXXX"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm uppercase focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Leads to Scrape
            </label>
            <input
              type="number"
              min={1}
              max={5000}
              value={requestedCount}
              onChange={(event) =>
                setRequestedCount(Number.parseInt(event.target.value, 10) || 0)
              }
              className="w-40 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Starting..." : "Start Scraping"}
          </button>
        </div>
      </div>
    </div>
  );
}
