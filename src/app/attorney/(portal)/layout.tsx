import Link from "next/link";
import { redirect } from "next/navigation";
import { getAttorneyIdentity } from "@/lib/auth";
import PrintButton from "./schedule/print-button";

export const dynamic = "force-dynamic";

export default async function AttorneyPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getAttorneyIdentity();
  if (!identity) redirect("/attorney/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-slate-900 text-white print:hidden">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/attorney/schedule" className="font-bold">
            TMCP Counsel Connections
          </Link>
          <nav
            aria-label="Attorney portal"
            className="flex flex-wrap items-center gap-2 text-sm"
          >
            <Link
              href="/attorney/schedule"
              className="rounded-md px-3 py-2 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              My schedule
            </Link>
            <Link
              href="/attorney/requests"
              className="rounded-md px-3 py-2 text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              Reschedule requests
            </Link>
            <PrintButton className="border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" />
            <form action="/attorney/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-slate-600 px-3 py-2 text-slate-200 hover:bg-slate-700 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6 print:max-w-none print:bg-white print:p-0">
        {children}
      </main>
    </div>
  );
}
