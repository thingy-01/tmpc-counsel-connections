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

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        <Link
          href="/portal"
          className="rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-900">
            Company &amp; Interviewee
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sign in with your invite code to view your interview schedule and
            manage interviewers. No account or email needed.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-slate-700 underline-offset-2 group-hover:underline">
            Enter invite code →
          </span>
        </Link>

        <Link
          href="/sign-in"
          className="rounded-xl border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-900">TMCP Staff</h2>
          <p className="mt-1 text-sm text-slate-500">
            Administrators sign in here to manage the event, schedule, companies,
            and attorneys.
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-slate-700 underline-offset-2 group-hover:underline">
            Staff sign in →
          </span>
        </Link>
      </div>
    </div>
  );
}
