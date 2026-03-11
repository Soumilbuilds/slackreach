interface Account {
  id: number;
  nickname: string;
  createdAt: string;
  status: "available" | "in-use";
}

interface Props {
  accounts: Account[];
  isLoading: boolean;
  onDelete: (id: number) => void;
}

export default function AccountList({ accounts, isLoading, onDelete }: Props) {
  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading accounts...</div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-12 text-center">
        No accounts yet. Add your first account to get started.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/50">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nickname
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Added
            </th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {accounts.map((account) => (
            <tr
              key={account.id}
              className="hover:bg-gray-50/50 transition-colors"
            >
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {account.nickname}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    account.status === "available"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {account.status}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {new Date(account.createdAt).toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  onClick={() => onDelete(account.id)}
                  className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
