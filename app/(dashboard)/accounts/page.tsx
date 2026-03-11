"use client";

import { useEffect, useState, useCallback } from "react";
import AccountList from "@/components/accounts/AccountList";
import AddAccountModal from "@/components/accounts/AddAccountModal";
import AccountOnboardingModal from "@/components/accounts/AccountOnboardingModal";

interface Account {
  id: number;
  nickname: string;
  createdAt: string;
  status: "available" | "in-use";
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/accounts");
      const data = await res.json();
      setAccounts(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  const refreshAccounts = async () => {
    setIsLoading(true);
    await fetchAccounts();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    await refreshAccounts();
  };

  const handleAddClick = () => {
    // Show onboarding only when user has no accounts yet
    if (accounts.length === 0) {
      setShowOnboarding(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleTutorial = () => {
    setShowOnboarding(true);
  };

  const handleOnboardingFinish = () => {
    setShowOnboarding(false);
    setIsModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
          Accounts
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleTutorial}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Tutorial
          </button>
          <button
            onClick={handleAddClick}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800 transition-colors"
          >
            Add Account
          </button>
        </div>
      </div>

      <AccountList
        accounts={accounts}
        isLoading={isLoading}
        onDelete={handleDelete}
      />

      {showOnboarding && (
        <AccountOnboardingModal
          onClose={() => setShowOnboarding(false)}
          onFinish={handleOnboardingFinish}
        />
      )}

      {isModalOpen && (
        <AddAccountModal
          onClose={() => setIsModalOpen(false)}
          onSaved={() => {
            setIsModalOpen(false);
            void refreshAccounts();
          }}
        />
      )}
    </div>
  );
}
