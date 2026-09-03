import Link from "next/link";
import AccountButton from "@/components/account-button";
import { adminNavItems } from "@/lib/admin-nav";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

async function getEventId() {
  const result = await db
    .select({ id: events.id })
    .from(events)
    .orderBy(desc(events.startDate))
    .limit(1);
  return result[0]?.id ?? null;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const eventId = await getEventId();

  const navItems = adminNavItems(eventId);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Mobile header: branded bar with collapsed navigation */}
      <details className="group border-b border-slate-700 bg-slate-900 text-slate-100 md:hidden print:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-base font-bold text-white">
              TMCP Admin
            </span>
            <span className="block text-xs text-slate-400">
              Counsel Connections
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

        <nav aria-label="Admin" className="space-y-0.5 px-3 pb-3">
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

        <div className="flex items-center gap-2 border-t border-slate-700 px-4 py-3">
          <AccountButton />
          <span className="text-xs text-slate-400">TMCP Staff</span>
        </div>
      </details>

      {/* Sidebar (desktop) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-slate-900 text-slate-100 md:flex print:hidden">
        <div className="border-b border-slate-700 p-5">
          <Link href="/admin">
            <h2 className="text-base font-bold text-white">TMCP Admin</h2>
          </Link>
          <p className="text-xs text-slate-400">Counsel Connections</p>
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
          <span className="text-xs text-slate-400">TMCP Staff</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="min-w-0 flex-1 overflow-auto bg-slate-50 p-4 md:p-8 print:bg-white print:p-0">
        {children}
      </main>
    </div>
  );
}
