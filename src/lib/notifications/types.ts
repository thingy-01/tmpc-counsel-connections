export const AUDIENCE_OPTIONS = [
  {
    kind: "active_with_confirmed_assignments",
    label: "Active attorneys with confirmed interviews",
  },
  {
    kind: "active_without_confirmed_assignments",
    label: "Active attorneys without a confirmed interview",
  },
  { kind: "all_active", label: "All active attorneys" },
] as const;

export type AudienceKind = (typeof AUDIENCE_OPTIONS)[number]["kind"];

export type StoredAudience = {
  kind: AudienceKind;
  previewSourceHash?: string;
};

export type ScheduleItem = {
  assignmentId: string;
  dayDate: string;
  dayLabel: string;
  dayFormat: string;
  startTime: string;
  endTime: string;
  companyName: string;
  interviewerName: string | null;
  preferredPlatform: string | null;
  notes: string | null;
};

export type AudienceAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  firm: string;
  conflicts: string | null;
  status: string;
  schedule: ScheduleItem[];
};

export type PreviewRecipient = {
  attorneyId: string;
  name: string;
  email: string;
  renderedSubject: string;
  renderedBody: string;
  contentHash: string;
  providerIdempotencyKey: string;
  status: "pending" | "blocked_ambiguous" | "blocked_invalid";
};

export type DeliveryFailureKind = "retryable" | "permanent";

export function isAudienceKind(value: string): value is AudienceKind {
  return AUDIENCE_OPTIONS.some((option) => option.kind === value);
}
