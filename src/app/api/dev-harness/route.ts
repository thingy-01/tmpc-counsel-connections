// Dev-only test harness — lets scripts/e2e-admin.py exercise server actions
// in-process. Active ONLY when DEV_AUTH is set in a non-production build
// (getDevAuth checks NODE_ENV); always a 404 on Railway / `next start`.
import { NextResponse } from "next/server";
import { getDevAuth } from "@/lib/dev-auth";
import * as eventActions from "@/app/admin/events/actions";
import * as dayActions from "@/app/admin/events/[eventId]/days/actions";
import * as companyActions from "@/app/admin/events/[eventId]/companies/actions";
import * as attorneyActions from "@/app/admin/events/[eventId]/attorneys/actions";
import * as assignmentActions from "@/app/admin/events/[eventId]/assignments/actions";
import * as portalActions from "@/app/portal/actions";
import * as profileActions from "@/app/portal/profile/actions";
import * as interviewerActions from "@/app/portal/interviewers/actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
const registry: Record<string, (...args: any[]) => Promise<unknown>> = {
  createEvent: (fd) => eventActions.createEvent({ ok: false }, fd),
  updateEvent: (fd) => eventActions.updateEvent({ ok: false }, fd),
  deleteEvent: (fd) => eventActions.deleteEvent(fd),
  clearAssignments: (fd) => eventActions.clearAssignments(fd),
  addDay: (fd) => dayActions.addDay({ ok: false }, fd),
  updateDay: (fd) => dayActions.updateDay({ ok: false }, fd),
  deleteDay: (fd) => dayActions.deleteDay(fd),
  addBreak: (fd) => dayActions.addBreak({ ok: false }, fd),
  removeBreak: (fd) => dayActions.removeBreak(fd),
  generateSlots: (fd) => dayActions.generateSlots({ ok: false }, fd),
  addSlot: (fd) => dayActions.addSlot({ ok: false }, fd),
  deleteSlot: (fd) => dayActions.deleteSlot(fd),
  createCompany: (fd) => companyActions.createCompany({ ok: false }, fd),
  updateCompany: (fd) => companyActions.updateCompany({ ok: false }, fd),
  deleteCompany: (fd) => companyActions.deleteCompany(fd),
  setCompanyStatus: (fd) => companyActions.setCompanyStatus(fd),
  regenerateInviteCode: (fd) => companyActions.regenerateInviteCode(fd),
  unclaimCompany: (fd) => companyActions.unclaimCompany(fd),
  addAttorney: (fd) => attorneyActions.addAttorney({ ok: false }, fd),
  updateAttorney: (fd) => attorneyActions.updateAttorney({ ok: false }, fd),
  deleteAttorney: (fd) => attorneyActions.deleteAttorney(fd),
  withdrawAttorney: (fd) => attorneyActions.withdrawAttorney(fd),
  reactivateAttorney: (fd) => attorneyActions.reactivateAttorney(fd),
  addUnavailability: (fd) => attorneyActions.addUnavailability(fd),
  removeUnavailability: (fd) => attorneyActions.removeUnavailability(fd),
  uploadResume: (fd) => attorneyActions.uploadResume(fd),
  removeResume: (fd) => attorneyActions.removeResume(fd),
  saveAssignment: (fd) => assignmentActions.saveAssignment({ ok: false }, fd),
  deleteAssignment: (fd) => assignmentActions.deleteAssignment({ ok: false }, fd),
  loginCompany: (fd) => portalActions.loginCompany({ ok: false }, fd),
  updateMyCompany: (fd) => profileActions.updateMyCompany({ ok: false }, fd),
  addInterviewer: (fd) => interviewerActions.addInterviewer(fd),
  updateInterviewer: (fd) => interviewerActions.updateInterviewer(fd),
  deleteInterviewer: (fd) => interviewerActions.deleteInterviewer(fd),
  assignInterviewer: (fd) => interviewerActions.assignInterviewer(fd),
  assignAllToInterviewer: (fd) => interviewerActions.assignAllToInterviewer(fd),
};

export async function POST(req: Request) {
  if (!getDevAuth()) return new NextResponse("Not found", { status: 404 });

  const incoming = await req.formData();
  const action = incoming.get("__action") as string;
  const fn = registry[action];
  if (!fn) {
    return NextResponse.json({ harnessError: `Unknown action ${action}` }, { status: 400 });
  }
  const fd = new FormData();
  for (const [k, v] of incoming.entries()) {
    if (k !== "__action") fd.append(k, v);
  }
  try {
    const result = await fn(fd);
    return NextResponse.json({ result: result ?? null });
  } catch (e: unknown) {
    const digest = (e as { digest?: string })?.digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) {
      return NextResponse.json({ redirect: digest });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
