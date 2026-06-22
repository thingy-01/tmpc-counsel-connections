import { db } from "@/lib/db";
import { companyInterviewers } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { getCompanyId } from "@/lib/auth";
import InterviewersManager from "./interviewers-manager";

export const dynamic = "force-dynamic";

export default async function InterviewersPage() {
  const companyId = await getCompanyId();

  if (!companyId) {
    return (
      <div className="text-slate-500">Session expired. Please sign in again.</div>
    );
  }

  const interviewers = await db
    .select({
      id: companyInterviewers.id,
      name: companyInterviewers.name,
      email: companyInterviewers.email,
      phone: companyInterviewers.phone,
    })
    .from(companyInterviewers)
    .where(eq(companyInterviewers.companyId, companyId))
    .orderBy(asc(companyInterviewers.name));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Manage Interviewers</h1>
        <p className="mt-1 text-slate-500">
          Add the people who will conduct your interviews, then assign them to
          time slots on{" "}
          <span className="font-medium text-slate-600">My Schedule</span>. With a
          single interviewer, they are assigned to every slot automatically.
        </p>
      </div>

      <InterviewersManager interviewers={interviewers} />
    </div>
  );
}
