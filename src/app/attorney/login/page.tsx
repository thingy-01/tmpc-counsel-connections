import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AttorneyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const invalid = params.error === "invalid";
  const unavailable = params.error === "unavailable";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-slate-500">
          TMCP Counsel Connections
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Attorney sign in
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the email address on your attorney registration. We will send a
          secure sign-in link if it is enrolled.
        </p>

        {sent && (
          <div className="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            If that address is enrolled, a sign-in link is on its way. The link
            expires in 15 minutes.
          </div>
        )}
        {invalid && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            That sign-in link is invalid or expired. Request a new link below.
          </div>
        )}
        {unavailable && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Attorney sign-in is temporarily unavailable. Please try again
            later.
          </div>
        )}

        <form action="/attorney/login/request" method="post" className="mt-6">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700"
          >
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Email me a sign-in link
          </button>
        </form>

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-slate-500 underline-offset-2 hover:underline"
        >
          Back to Counsel Connections
        </Link>
      </div>
    </main>
  );
}
