import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";

async function getEventId() {
  const result = await db.select({ id: events.id }).from(events).limit(1);
  return result[0]?.id ?? null;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const eventId = await getEventId();

  const navItems = [
    { href: "/admin", label: "Dashboard" },
    ...(eventId
      ? [
          { href: `/admin/events/${eventId}/attorneys`, label: "Attorneys" },
          { href: `/admin/events/${eventId}/companies`, label: "Companies" },
          {
            href: `/admin/events/${eventId}/assignments`,
            label: "Master Schedule",
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r bg-slate-900 text-slate-100">
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
          <UserButton />
          <span className="text-xs text-slate-400">TMCP Staff</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-slate-50 p-8">{children}</main>
    </div>
  );
}
