"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import CompanyFields, { type CompanyFieldValues } from "@/components/company-fields";
import { updateMyCompany, type ProfileResult } from "./actions";

const idle: ProfileResult = { ok: false };

export default function ProfileForm({ company }: { company: CompanyFieldValues }) {
  const [state, formAction, pending] = useActionState(updateMyCompany, idle);

  return (
    <form action={formAction} className="space-y-4">
      <CompanyFields company={company} includeName={false} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-emerald-600">Profile saved. Thank you!</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
