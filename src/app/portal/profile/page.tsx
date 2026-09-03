import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCompanyId } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ProfileForm from "./profile-form";
import { isCompanyProfileComplete } from "@/lib/company-profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const companyId = await getCompanyId();
  if (!companyId) {
    return <div className="text-slate-500">Session expired. Please sign in again.</div>;
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, companyId),
  });
  if (!company) {
    return <div className="text-slate-500">Company not found.</div>;
  }

  const profileComplete = isCompanyProfileComplete(company);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Company Profile</h1>
        <p className="mt-1 text-slate-500">
          {company.name} — keep your details current so TMCP and your matched
          attorneys have the right information.
        </p>
      </div>

      {!profileComplete && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
        >
          <p className="font-semibold">Complete your company information first</p>
          <p className="mt-1 text-sm text-amber-800">
            Enter the primary contact name and email below, then save your
            profile to access interviewers, scheduling, and the rest of the
            company portal.
          </p>
        </div>
      )}

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>
            Your company name is set by TMCP. Update everything else here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            company={company}
            requireProfileContacts={!profileComplete}
          />
        </CardContent>
      </Card>
    </div>
  );
}
