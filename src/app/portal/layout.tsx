import Link from "next/link";
import AccountButton from "@/components/account-button";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCompanyId } from "@/lib/auth";
import ClaimCompany from "./claim-company";

const navItems = [
  { href: "/portal", label: "Home" },
  { href: "/portal/interviewers", label: "Interviewers" },
  { href: "/portal/schedule", label: "My Schedule" },
  { href: "/portal/schedule/review", label: "Schedule Review" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const companyId = await getCompanyId();

  // Signed in but not yet linked to a company — show the invite-code claim flow.
  if (!companyId) {
    return <ClaimCompany />;
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { name: true },
  });
  const companyName = company?.name ?? "Company Portal";

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-slate-900 text-slate-100">
        <div className="border-b border-slate-700 p-5">
          <Link href="/portal">
            <h2 className="text-base font-bold leading-tight text-white">
              {companyName}
            </h2>
          </Link>
          <p className="text-xs text-slate-400">Counsel Connections Portal</p>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 border-t border-slate-700 p-4">
          <AccountButton />
          <span className="text-xs text-slate-400">Account</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-slate-50 p-8">{children}</main>
    </div>
  );
}
