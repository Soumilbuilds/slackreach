"use client";

import { useState, useEffect } from "react";
import MessageEditor from "@/components/campaigns/MessageEditor";

interface Account {
  id: number;
  nickname: string;
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function CreateCampaignModal({ onClose, onSaved }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [messages, setMessages] = useState<string[]>([""]);
  const [availableAccounts, setAvailableAccounts] = useState<Account[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([]);
  const [dmsPerDay, setDmsPerDay] = useState(10);
  const [minDelay, setMinDelay] = useState(60);
  const [maxDelay, setMaxDelay] = useState(180);
  const [skipPreviouslyContacted, setSkipPreviouslyContacted] = useState(false);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (step === 3) {
      fetch("/api/accounts/available")
        .then((res) => res.json())
        .then(setAvailableAccounts);
    }
  }, [step]);

  const canProceed = () => {
    switch (step) {
      case 1:
        return name.trim().length > 0;
      case 2:
        return messages.some((m) => m.trim().length > 0);
      case 3:
        return selectedAccountIds.length > 0;
      case 4:
        return dmsPerDay >= 1;
      default:
        return false;
    }
  };

  const handleNext = () => {
    setError("");
    if (!canProceed()) {
      switch (step) {
        case 1:
          setError("Please enter a campaign name.");
          break;
        case 2:
          setError("Please write at least one message.");
          break;
        case 3:
          setError("Please select at least one account.");
          break;
      }
      return;
    }
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError("");
    setStep((s) => s - 1);
  };

  const handleSave = async () => {
    if (!canProceed()) {
      setError("DMs per day must be at least 1.");
      return;
    }

    setIsSaving(true);
    setError("");

    const filteredMessages = messages.filter((m) => m.trim().length > 0);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          messages: filteredMessages,
          accountIds: selectedAccountIds,
          dmsPerDay,
          minDelaySeconds: minDelay,
          maxDelaySeconds: Math.max(minDelay, maxDelay),
          skipPreviouslyContacted,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create campaign.");
        return;
      }

      onSaved();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleAccount = (id: number) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s <= step ? "bg-gray-900" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Campaign Name */}
        {step === 1 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Campaign Name
            </h3>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter campaign name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              autoFocus
            />
          </div>
        )}

        {/* Step 2: Messages */}
        {step === 2 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Compose Messages
            </h3>
            <div className="max-h-80 overflow-y-auto">
              <MessageEditor messages={messages} onChange={setMessages} />
            </div>
          </div>
        )}

        {/* Step 3: Select Accounts */}
        {step === 3 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Select Accounts
            </h3>
            {availableAccounts.length === 0 ? (
              <p className="text-sm text-gray-500">
                No available accounts. Add accounts first.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {availableAccounts.map((account) => (
                  <label
                    key={account.id}
                    className={`flex items-center gap-3 px-3 py-2 border rounded-md cursor-pointer transition-colors ${
                      selectedAccountIds.includes(account.id)
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.includes(account.id)}
                      onChange={() => toggleAccount(account.id)}
                      className="rounded border-gray-300"
                    />
                    <div className="text-sm font-medium text-gray-900">
                      {account.nickname}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 4: DMs Per Day */}
        {step === 4 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Sending Settings
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              How many DMs should each selected account send per day?
            </p>
            <input
              type="number"
              value={dmsPerDay}
              onChange={(e) =>
                setDmsPerDay(parseInt(e.target.value, 10) || 0)
              }
              min={1}
              className="w-32 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />

            <div className="mt-5">
              <p className="text-sm font-medium text-gray-900 mb-1">
                Delay between messages
              </p>
              <p className="text-xs text-gray-500 mb-3">
                A random delay between the min and max values will be applied between each DM to look natural.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={minDelay}
                  onChange={(e) =>
                    setMinDelay(parseInt(e.target.value, 10) || 0)
                  }
                  min={10}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <span className="text-sm text-gray-500">to</span>
                <input
                  type="number"
                  value={maxDelay}
                  onChange={(e) =>
                    setMaxDelay(parseInt(e.target.value, 10) || 0)
                  }
                  min={10}
                  className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                <span className="text-sm text-gray-500">seconds</span>
              </div>
            </div>

            <label className="flex items-start gap-3 mt-5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipPreviouslyContacted}
                onChange={(e) =>
                  setSkipPreviouslyContacted(e.target.checked)
                }
                className="mt-0.5 rounded border-gray-300"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">
                  Skip previously contacted people
                </span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Before sending, check Slack for existing DM history and skip anyone you&apos;ve already messaged — even outside of SlackReach.
                </p>
              </div>
            </label>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6">
          <div>
            {step > 1 && (
              <button
                onClick={handleBack}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Back
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isSaving || !canProceed()}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? "Saving..." : "Save to Draft"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
