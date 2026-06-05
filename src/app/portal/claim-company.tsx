"use client";

import { useActionState } from "react";
import { claimCompany, type ClaimResult } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initial: ClaimResult = { ok: false };

export default function ClaimCompany() {
  const [state, formAction, pending] = useActionState(claimCompany, initial);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 p-8">
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader>
          <CardTitle>Claim your company</CardTitle>
          <CardDescription>
            Enter the invite code from your TMCP invitation to link your account
            to your company.
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
                placeholder="e.g. ABCD-1234"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              />
            </div>

            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Linking…" : "Claim company"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
