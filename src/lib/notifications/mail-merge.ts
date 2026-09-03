import { escapeForSpreadsheet } from "@/lib/spreadsheet-safe";

export const TRACKED_ASSIGNMENTS_HEADERS = [
  "First Name",
  "Last Name",
  "Daytime Number",
  "eMail",
  "Firm",
  "Conflicts",
  ...Array.from({ length: 9 }, (_, index) => {
    const group = index + 1;
    return [
      `Date${group}`,
      `Time${group}`,
      `Company${group}`,
      `Interviewer${group}`,
      group === 1 ? "Comments1 " : `Comments${group}`,
    ];
  }).flat(),
] as const;

export type MailMergeInterview = {
  dayDate: string;
  startTime: string;
  endTime: string;
  companyName: string;
  interviewerName: string | null;
  preferredPlatform: string | null;
};

export type MailMergeAttorney = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
  firm: string;
  conflicts: string | null;
  interviews: MailMergeInterview[];
};

function groupHeaders(group: number): string[] {
  return [
    `Date${group}`,
    `Time${group}`,
    `Company${group}`,
    `Interviewer${group}`,
    group === 1 ? "Comments1 " : `Comments${group}`,
  ];
}

export function mailMergeHeaders(maxInterviewCount: number): string[] {
  const groupCount = Math.max(9, maxInterviewCount);
  return [
    "First Name",
    "Last Name",
    "Daytime Number",
    "eMail",
    "Firm",
    "Conflicts",
    ...Array.from({ length: groupCount }, (_, index) =>
      groupHeaders(index + 1)
    ).flat(),
    "Overflow_Count",
  ].map(escapeForSpreadsheet);
}

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatTime(time: string): string {
  const [hourText, minute = "00"] = time.split(":");
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "p.m." : "a.m."}`;
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function interviewCells(interview: MailMergeInterview): string[] {
  const comments = [
    interview.preferredPlatform
      ? `Platform: ${titleCase(interview.preferredPlatform)}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");
  const interviewer = interview.interviewerName
    ? `${/[&,]/.test(interview.interviewerName) ? "Interviewers" : "Interviewer"}: ${interview.interviewerName}`
    : "";
  return [
    formatDate(interview.dayDate),
    `${formatTime(interview.startTime)} - ${formatTime(interview.endTime)}`,
    interview.companyName,
    interview.interviewerName && /^[=+\-@\t\r\n]/.test(interview.interviewerName)
      ? `'${interviewer}`
      : interviewer,
    comments,
  ];
}

export function buildMailMergeTable(attorneys: MailMergeAttorney[]): {
  headers: string[];
  rows: string[][];
  groupCount: number;
  overflowAttorneys: Array<{ id: string; name: string; count: number }>;
} {
  const groupCount = Math.max(
    9,
    ...attorneys.map((attorney) => attorney.interviews.length)
  );
  const headers = mailMergeHeaders(groupCount);
  const rows = attorneys.map((attorney) => {
    const base = [
      attorney.firstName,
      attorney.lastName,
      attorney.phone ?? "",
      attorney.email,
      attorney.firm,
      attorney.conflicts ?? "",
    ];
    const groups = Array.from({ length: groupCount }, (_, index) =>
      attorney.interviews[index]
        ? interviewCells(attorney.interviews[index])
        : ["", "", "", "", ""]
    ).flat();
    return [...base, ...groups, String(Math.max(0, attorney.interviews.length - 8))].map(
      escapeForSpreadsheet
    );
  });
  const overflowAttorneys = attorneys
    .filter((attorney) => attorney.interviews.length > 8)
    .map((attorney) => ({
      id: attorney.id,
      name: `${attorney.firstName} ${attorney.lastName}`,
      count: attorney.interviews.length,
    }));
  return { headers, rows, groupCount, overflowAttorneys };
}
