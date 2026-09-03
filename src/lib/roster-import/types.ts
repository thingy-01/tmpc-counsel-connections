export const ROSTER_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "firm",
  "city",
  "organizationType",
  "practiceArea",
  "percent",
  "partnerCount",
  "associateCount",
  "ofCounselCount",
  "resumeReference",
] as const;

export type RosterField = (typeof ROSTER_FIELDS)[number];
export type ColumnMapping = Partial<Record<RosterField, string>>;
export type PercentFormat = "fraction" | "whole";

export type StoredCell = {
  text: string;
  numericValue?: number;
  numberFormat?: string;
  rejectedFormula?: boolean;
  truncated?: boolean;
};

export type StoredRow = Record<string, StoredCell>;

export type ExistingAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  firm: string;
  city: string | null;
  organizationType: string | null;
  practiceAreas: unknown;
  partnerCount: number | null;
  associateCount: number | null;
  ofCounselCount: number | null;
  status: string;
  updatedAt: Date | null;
};

export type ResumeReference = { url: string; label: string };

export type ParsedCandidate = {
  firstName: string;
  lastName: string;
  email: string | null;
  firm: string;
  city: string | null;
  organizationType: string | null;
  practiceAreas: Array<{ area: string; percent?: number; percentScale?: "whole" | "fraction" }>;
  partnerCount: number | null;
  associateCount: number | null;
  ofCounselCount: number | null;
  resumeReferences: ResumeReference[];
  sourceRowNumbers: number[];
  previewFingerprint: string;
};

export type CandidateIssueCode =
  | "missing_name"
  | "missing_firm"
  | "missing_percent"
  | "invalid_percent"
  | "duplicate_area"
  | "percent_sum_out_of_range"
  | "over_two_areas"
  | "invalid_email"
  | "missing_email"
  | "ambiguous_identity"
  | "unsafe_resume_reference"
  | "missing_resume_reference"
  | "formula_cell"
  | "oversized_cell"
  | "invalid_count";

export type CandidateIssue = {
  code: CandidateIssueCode;
  severity: "warning" | "block";
  message: string;
  rowNumbers?: number[];
};

export type ValidatedCandidate = {
  candidateId?: string;
  identityKey: string;
  parsed: ParsedCandidate;
  joinedEmail: string | null;
  emailSource: "file" | "companion_join" | "manual" | "none";
  resolvedEmail: string | null;
  matchAttorneyId: string | null;
  matchMethod: "event_email" | "name_firm" | "manual" | "none";
  resolution: "create" | "update" | "needs_email" | "ambiguous" | "error";
  issues: CandidateIssue[];
};

export type CandidateOverrides = Record<
  string,
  { correctedEmail?: string | null; manualAttorneyId?: string | null }
>;

export type ApplyDecision = "create" | "update" | "skip";
