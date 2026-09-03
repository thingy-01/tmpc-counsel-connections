import { getAttorneyIdentity } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AttorneyPortalPage() {
  let identity;
  try {
    identity = await getAttorneyIdentity();
  } catch {
    redirect("/attorney/login?error=unavailable");
  }
  if (!identity) redirect("/attorney/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          TMCP Counsel Connections
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          You are signed in
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Your attorney session is active. Your event schedule will appear here
          when scheduling is available.
        </p>
        <form action="/attorney/logout" method="post" className="mt-6">
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
