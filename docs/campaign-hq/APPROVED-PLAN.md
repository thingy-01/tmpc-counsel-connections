# Counsel Connections feedback implementation plan

Status: approved September 3, 2026. Joshua authorized implementation and deployment to the existing live site using the campaign skill. Participant emails still require a specific send authorization.

Source: Granola, “Counsel-Connections.org Feedback,” September 3, 2026, 10:02 AM CDT. Meeting ID: `1c071f4b-f1aa-4e29-8248-2d8a6460ef19`. Both the summary and transcript were read.

## Delivery order

### 1. Onboarding and immediate feedback fixes

- Send first-time companies and companies with incomplete profiles to their profile after invite-code login. Returning companies with completed profiles can proceed to their schedule.
- Make saved attorney details, availability blocks, and resume changes visible immediately inside the open dialog and the roster. Investigate the availability error seen during the walkthrough and return useful form errors.
- Verify interviewer additions and edits refresh the company list and schedule controls immediately.
- Preserve company practice areas as free text, as agreed in the meeting.

Code evidence: company login currently always redirects to `/portal`. The attorney roster stores a complete selected attorney object in local state and continues passing that snapshot to the dialog after refreshed server props arrive. This explains the stale dialog behavior; the interviewer behavior still needs reproduction.

### 2. Attorney data and roster upload

- Use the registration form's organization types and practice areas for attorney entry. The transcript explicitly identifies these as interviewee fields, correcting the summary's use of “interviewer.”
- Support up to two practice areas with their percentages. Normalize existing string-only and structured practice-area data without inventing missing percentages or losing existing values.
- Add an admin spreadsheet import with a preview, column mapping, validation, and explicit confirmation before database writes.
- Merge rows representing the same attorney and combine practice areas. Prefer event plus verified email identity; flag ambiguous identities and missing emails for correction. Re-uploading the same roster must not create duplicates or overwrite scheduling/resume data unintentionally.
- Preserve resume references and report missing or unusable files; verify the export's resume format before implementing retrieval.

Existing references: the repository includes the 2025 registration form, attorney breakdown workbook, and assignments workbook. Its seed script already groups practice-area rows by name and firm and preserves percentages. Use these as fixtures and reference material, not as a production import command. Manual attorney editing currently converts practice areas to strings, so that data handling needs to be unified.

The current registration export is an external dependency: staff need Tom Preston to restore practice areas, percentages, and usable resume references on the attorney's row. The importer cannot reconstruct information missing from that export.

### 3. Company scheduling

- Build an editable schedule using the staff schedule's interaction pattern, scoped to the signed-in company's event and assignments.
- Let companies browse/filter interviewees, choose an available slot and attorney, assign their interviewer, and change or remove selections while scheduling is open.
- Display attorney name, firm, city, organization type, practice areas and percentages, and an authorized resume link.
- Include preferred virtual platform/meeting notes in the selection and schedule views, reusing the existing company preference where appropriate.
- Enforce event boundaries, company ownership, withdrawn status, availability blocks, and booking conflicts on the server. Concurrent attempts to book the same attorney must result in one booking and a useful conflict message.
- Keep other companies' schedules and internal unavailability notes private. Reflect successful edits in the company schedule, staff master schedule, and printable view.
- Use the event's opening/closing controls to govern company selections. Do not hardcode September 21 as an annual opening date.

Code evidence: the current company schedule only lists existing assignments. Creation/deletion actions require an admin, so exposing the staff action directly would not implement the required company workflow.

### 4. Attorney access and notifications

- Add a distinct attorney sign-in and portal. Registered attorneys enter their email, receive a short-lived, single-use magic link, and see only their own current interviews, including dates, times, companies, format/location, and relevant meeting instructions.
- Keep company invite-code login and staff authentication working alongside the new attorney role.
- Provide a print-friendly attorney schedule.
- Add an admin-controlled notification action with a recipient/message preview and send results, so staff can announce schedules without manually composing each attorney's message. Sending to real participants remains a separate authorized action.
- Provide a spreadsheet export suitable for the existing mail-merge workflow as a fallback.
- Verify Jen and Tracy's staff access using their confirmed identities and the existing admin access system. No new general role system is proposed.

The transcript first requests a schedule export, then discusses a single admin notification action and settles on attorney magic-link access. This plan proposes both portal access and staff-controlled announcement delivery. The current repository has neither an attorney role nor an email delivery implementation. Email delivery configuration and end-to-end receipt testing are required before release.

### 5. Rescheduling requests — proposed scope decision

The meeting raises last-minute rescheduling and possible contact with corporations, but does not settle who approves changes or whether corporate contact details should be exposed.

Recommendation for approval: let an attorney submit a rescheduling request to staff, display its status, and keep the existing booking until staff resolve it. Direct attorney-company messaging is deferred until the workflow is agreed.

## Validation and release boundary

- Configure an isolated development database and suitable test authentication/email delivery after plan approval.
- Reproduce the walkthrough: company login/profile, interviewer add/edit, attorney availability/resume updates, roster import, company selections, attorney access, schedule visibility, and notification preview.
- Cover duplicate imports, missing/invalid percentages, ambiguous identities, simultaneous booking conflicts, event closure, cross-company and cross-attorney isolation, and expired/reused login links.
- Check desktop/mobile layouts and printable schedules, plus TypeScript, lint, and build.
- Prioritize company onboarding, imports, and scheduling for the selection window after the September 21 registration deadline. Validate the end-to-end path with staff before invite distribution, consistent with the meeting's decision.
- Present completed changes and validation results for review. Deployment, production migrations, account invitations, and participant announcements are distinct release actions.

No application source, schema, credentials, production data, or remote repository state was changed while preparing this plan.
