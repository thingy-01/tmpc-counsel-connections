import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          TMCP Counsel Connections
        </h1>
        <p className="mt-2 text-slate-600">
          Texas Minority Counsel Program — Attorney Interview Scheduling
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        <Link
          href="/portal"
          className="group flex h-full flex-col rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2"
        >
          <h2 className="text-lg font-semibold text-slate-900">Company</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
            For company representatives conducting interviews. Enter your invite
            code to manage your interview team and schedule.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-slate-700 underline-offset-2 group-hover:underline">
            Company sign in →
          </span>
        </Link>

        <Link
          href="/attorney/login"
          className="group flex h-full flex-col rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2"
        >
          <h2 className="text-lg font-semibold text-slate-900">Attorney</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
            For attorneys being interviewed. Sign in by email to view, print, or
            request changes to your interview schedule.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-slate-700 underline-offset-2 group-hover:underline">
            Attorney sign in →
          </span>
        </Link>

        <Link
          href="/sign-in"
          className="group flex h-full flex-col rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-600 focus-visible:ring-offset-2"
        >
          <h2 className="text-lg font-semibold text-slate-900">Staff</h2>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
            For TMCP administrators managing the program. Sign in to manage
            companies, attorneys, schedules, and notifications.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-slate-700 underline-offset-2 group-hover:underline">
            Staff sign in →
          </span>
        </Link>
      </div>
    </div>
  );
}
