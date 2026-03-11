"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Accounts", href: "/accounts" },
  { label: "Leads", href: "/leads" },
  { label: "Campaigns", href: "/campaigns" },
  { label: "Plans", href: "/plans" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 h-screen border-r border-gray-200 bg-white flex flex-col shrink-0">
      <div className="px-6 py-6 border-b border-gray-200">
        <h1 className="text-lg font-semibold tracking-tight text-gray-900">
          SlackReach
        </h1>
      </div>

      <nav className="flex-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 px-3 py-3">
        <Link
          href="/settings"
          className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname.startsWith("/settings")
              ? "bg-gray-100 text-gray-900"
              : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
          }`}
        >
          Settings
        </Link>
      </div>
    </aside>
  );
}
