"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginCompany, type LoginResult } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initial: LoginResult = { ok: false };

/** Email-free company sign-in: enter the TMCP invite code, no account needed. */
export default function CompanyLogin() {
  const [state, formAction, pending] = useActionState(loginCompany, initial);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          TMCP Counsel Connections
        </h1>
        <p className="mt-1 text-slate-600">Company &amp; Interviewee Portal</p>
      </div>
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader>
          <CardTitle>Sign in with your invite code</CardTitle>
          <CardDescription>
            Enter the invite code from your TMCP invitation. No account or email
            verification needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div>
              <label
                htmlFor="inviteCode"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Invite code
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                required
                autoFocus
                placeholder="e.g. acme-corp-4f9x2a"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            {state.error && <p className="text-sm text-red-600">{state.error}</p>}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-500">
            TMCP staff?{" "}
            <Link href="/sign-in" className="font-medium text-slate-700 underline">
              Staff sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
