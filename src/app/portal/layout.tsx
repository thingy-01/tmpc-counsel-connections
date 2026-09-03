import Link from "next/link";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCompanyId } from "@/lib/auth";
import CompanyLogin from "./claim-company";
import PortalLogout from "./portal-logout";

const navItems = [
  { href: "/portal", label: "Home" },
  { href: "/portal/profile", label: "Company Profile" },
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

  // Not logged in yet — show the email-free invite-code sign-in.
  if (!companyId) {
    return <CompanyLogin />;
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
    columns: { name: true },
  });
  const companyName = company?.name ?? "Company Portal";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile header: branded bar with collapsed navigation */}
      <details className="group border-b border-slate-700 bg-slate-900 text-slate-100 md:hidden print:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-base font-bold leading-tight text-white">
              {companyName}
            </span>
            <span className="block text-xs text-slate-400">
              Counsel Connections Portal
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200">
            Menu
            <span
              aria-hidden="true"
              className="text-xs transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </span>
        </summary>

        <nav aria-label="Company portal" className="space-y-0.5 px-3 pb-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-md px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Logout keeps its shared markup; sized up here for a tappable target. */}
        <div className="flex items-center justify-between gap-2 border-t border-slate-700 px-4 py-3 [&_button]:px-3 [&_button]:py-2.5 [&_button]:text-sm">
          <span className="text-xs text-slate-400">Signed in</span>
          <PortalLogout />
        </div>
      </details>

      {/* Sidebar (desktop) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-slate-900 text-slate-100 md:flex print:hidden">
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

        <div className="flex items-center justify-between gap-2 border-t border-slate-700 p-4">
          <span className="text-xs text-slate-400">Signed in</span>
          <PortalLogout />
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-auto bg-slate-50 p-4 md:p-8 print:bg-white print:p-0">
        {children}
      </main>
    </div>
  );
}
