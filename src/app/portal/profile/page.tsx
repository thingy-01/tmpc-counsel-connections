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

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Company Profile</h1>
        <p className="mt-1 text-slate-500">
          {company.name} — keep your details current so TMCP and your matched
          attorneys have the right information.
        </p>
      </div>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="text-base">Your details</CardTitle>
          <CardDescription>
            Your company name is set by TMCP. Update everything else here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm company={company} />
        </CardContent>
      </Card>
    </div>
  );
}
