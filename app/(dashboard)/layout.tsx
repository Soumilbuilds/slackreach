import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getCurrentUserFromCookies } from "@/lib/auth";
import { resolveBillingGate } from "@/lib/billing";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/access");
  }

  const gate = await resolveBillingGate(user);
  if (!gate.shouldAllowAccess && gate.redirectUrl) {
    redirect(gate.redirectUrl);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50/50 p-8">{children}</main>
    </div>
  );
}

