interface CampaignAccount {
  account: { id: number; nickname: string };
}

interface Campaign {
  id: number;
  name: string;
  status: string;
  dmsPerDay: number;
  createdAt: string;
  messages: { id: number; messageText: string; sortOrder: number }[];
  accounts: CampaignAccount[];
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

interface Props {
  campaigns: Campaign[];
  isLoading: boolean;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: "draft" | "active") => void;
}

export default function CampaignList({
  campaigns,
  isLoading,
  onDelete,
  onStatusChange,
}: Props) {
  const formatDateTime = (value: string | null): string => {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return date.toLocaleString();
  };

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading campaigns...</div>;
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-12 text-center">
        No campaigns yet. Create your first campaign to get started.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Messages
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Accounts
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Total Leads
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Uncontacted
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Sent
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Skipped
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              DMs/Day
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Next DM
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {campaigns.map((campaign) => (
            <tr
              key={campaign.id}
              className="hover:bg-gray-50/50 transition-colors"
            >
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {campaign.name}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    campaign.status === "active"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {campaign.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.messages.length} variation
                {campaign.messages.length !== 1 ? "s" : ""}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.accounts.length} account
                {campaign.accounts.length !== 1 ? "s" : ""}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.stats?.totalLeads ?? campaign._count?.leads ?? 0}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.stats?.uncontactedLeads ?? 0}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.stats?.sentLeads ?? 0}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.stats?.skippedLeads ?? 0}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {campaign.dmsPerDay}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                <div>{formatDateTime(campaign.nextSendAt)}</div>
                {campaign.sendError && (
                  <div className="text-xs text-red-600 mt-1 max-w-48 line-clamp-2">
                    {campaign.sendError}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-3">
                  {campaign.status !== "active" && (
                    <button
                      onClick={() => onStatusChange(campaign.id, "active")}
                      disabled={(campaign.stats?.totalLeads ?? campaign._count?.leads ?? 0) < 1}
                      className="text-xs text-gray-600 hover:text-gray-900 disabled:opacity-40 transition-colors"
                    >
                      Publish
                    </button>
                  )}
                  {campaign.status === "active" && (
                    <button
                      onClick={() => onStatusChange(campaign.id, "draft")}
                      className="text-xs text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      Unpublish
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(campaign.id)}
                    className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
