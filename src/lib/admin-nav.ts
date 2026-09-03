export function adminNavItems(
  eventId: string | null
): { href: string; label: string }[] {
  return [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/events", label: "Events" },
    ...(eventId
      ? [
          { href: `/admin/events/${eventId}/days`, label: "Days & Slots" },
          { href: `/admin/events/${eventId}/attorneys`, label: "Attorneys" },
          { href: `/admin/events/${eventId}/companies`, label: "Companies" },
          {
            href: `/admin/events/${eventId}/assignments`,
            label: "Master Schedule",
          },
          { href: `/admin/events/${eventId}/settings`, label: "Settings" },
          {
            href: `/admin/events/${eventId}/roster-import`,
            label: "Roster Import",
          },
          {
            href: `/admin/events/${eventId}/requests`,
            label: "Reschedule Requests",
          },
          {
            href: `/admin/events/${eventId}/notifications`,
            label: "Notifications",
          },
        ]
      : []),
  ];
}
