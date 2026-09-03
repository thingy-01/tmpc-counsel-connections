import type { AudienceAttorney } from "@/lib/notifications/types";

export const DEFAULT_NOTIFICATION_SUBJECT =
  "Your {{event_name}} interview schedule is ready";

export const DEFAULT_NOTIFICATION_BODY = `Hello {{first_name}},

Your interview schedule for {{event_name}} is ready:

{{schedule}}

Sign in to view the current schedule and full meeting details:
{{portal_url}}

Texas Minority Counsel Program`;

function displayTime(time: string): string {
  const [hourText, minute = "00"] = time.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "p.m." : "a.m.";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export function renderSchedule(schedule: AudienceAttorney["schedule"]): string {
  if (schedule.length === 0) return "No confirmed interviews are scheduled.";
  return schedule
    .map((item) => {
      const details = [
        `${item.dayLabel}, ${displayTime(item.startTime)} - ${displayTime(item.endTime)}`,
        item.companyName,
        item.interviewerName ? `Interviewer: ${item.interviewerName}` : null,
        item.dayFormat === "virtual" && item.preferredPlatform
          ? `Platform: ${titleCase(item.preferredPlatform)}`
          : null,
        item.notes ? `Notes: ${item.notes}` : null,
      ].filter(Boolean);
      return details.join("\n");
    })
    .join("\n\n");
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, key: string) =>
    Object.hasOwn(values, key.toLowerCase()) ? values[key.toLowerCase()] : match
  );
}

export function renderScheduleAnnouncement(input: {
  attorney: AudienceAttorney;
  eventName: string;
  portalUrl: string;
  subjectTemplate: string;
  bodyTemplate: string;
}): { subject: string; body: string } {
  const values = {
    first_name: input.attorney.firstName,
    last_name: input.attorney.lastName,
    full_name: `${input.attorney.firstName} ${input.attorney.lastName}`,
    event_name: input.eventName,
    schedule: renderSchedule(input.attorney.schedule),
    portal_url: input.portalUrl,
  };
  return {
    subject: fill(input.subjectTemplate, values),
    body: fill(input.bodyTemplate, values),
  };
}
