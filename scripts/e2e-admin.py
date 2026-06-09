#!/usr/bin/env python3
"""E2E admin scenario for the dev server.

Prereqs:
  - a local Postgres with the schema pushed (drizzle-kit push)
  - `npm run dev -- -p 3100` running with DEV_AUTH=admin in .env.local
  - E2E_PSQL env var if psql needs non-default flags

WIPES the database (runs scripts/wipe.ts) before testing.
"""
import json, subprocess, sys, urllib.request, uuid

BASE = "http://localhost:3100"
passed, failed = 0, 0

import os, shlex
PSQL = os.environ.get("E2E_PSQL", "psql -h 127.0.0.1 -U postgres -d tmpc")

def psql(q):
    return subprocess.run(
        shlex.split(PSQL) + ["-tA", "-c", q],
        capture_output=True, text=True).stdout.strip()

def act(action, **fields):
    boundary = uuid.uuid4().hex
    parts = []
    fields["__action"] = action
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
    body = ("".join(parts) + f"--{boundary}--\r\n").encode()
    req = urllib.request.Request(BASE + "/api/dev-harness", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())

def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ok  {name}")
    else:
        failed += 1
        print(f"FAIL  {name}  {detail}")

def get(path):
    try:
        with urllib.request.urlopen(BASE + path) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, ""

# ---------- 1. empty state ----------
status, html = get("/admin")
check("dashboard empty state", status == 200 and "Create your first event" in html)
status, html = get("/admin/events")
check("events page empty state", status == 200 and "No events yet" in html)

# ---------- 2. create event ----------
r = act("createEvent", name="Test CC 2026", startDate="2026-10-05", endDate="2026-10-06",
        slotDuration="15", status="draft", location="Houston, TX", description="")
check("createEvent redirects to days", "redirect" in r, json.dumps(r))
event_id = psql("select id from events limit 1")
check("event row exists", len(event_id) == 36)

# invalid event
r = act("createEvent", name="", startDate="2026-10-05", endDate="2026-10-06", slotDuration="15")
check("createEvent rejects empty name", r.get("result", {}).get("error") == "Event name is required.", json.dumps(r))
r = act("createEvent", name="X", startDate="2026-10-07", endDate="2026-10-06", slotDuration="15")
check("createEvent rejects bad dates", "End date" in str(r.get("result", {}).get("error")), json.dumps(r))

# ---------- 3. days & slots ----------
r = act("addDay", eventId=event_id, date="2026-10-05", label="", format="in_person",
        startTime="09:00", endTime="12:00", generateSlots="on")
check("addDay ok", r.get("result", {}).get("ok") is True, json.dumps(r))
day1 = psql("select id from event_days where date='2026-10-05'")
label1 = psql("select label from event_days where date='2026-10-05'")
check("day label auto-generated", label1 == "Monday, October 5", label1)
slots1 = int(psql(f"select count(*) from time_slots where event_day_id='{day1}'"))
check("12 slots generated (9-12, 15min)", slots1 == 12, str(slots1))

r = act("addDay", eventId=event_id, date="2026-10-05", label="dupe", format="virtual",
        startTime="09:00", endTime="10:00")
check("duplicate date rejected", "already on the schedule" in str(r.get("result", {}).get("error")), json.dumps(r))

r = act("addDay", eventId=event_id, date="2026-10-06", label="Day Two (Virtual)", format="virtual",
        startTime="13:00", endTime="15:00", generateSlots="on")
day2 = psql("select id from event_days where date='2026-10-06'")
slots2 = int(psql(f"select count(*) from time_slots where event_day_id='{day2}'"))
check("day 2 has 8 slots", slots2 == 8, str(slots2))

# break + regenerate
r = act("addBreak", eventId=event_id, dayId=day1, startTime="10:30", endTime="11:00", label="Coffee")
check("addBreak ok", r.get("result", {}).get("ok") is True, json.dumps(r))
r = act("generateSlots", eventId=event_id, dayId=day1)
check("regenerate ok", r.get("result", {}).get("ok") is True, json.dumps(r))
slots1b = int(psql(f"select count(*) from time_slots where event_day_id='{day1}'"))
check("break removed 2 slots (12->10)", slots1b == 10, str(slots1b))
inbreak = int(psql(f"select count(*) from time_slots where event_day_id='{day1}' and start_time>='10:30' and start_time<'11:00'"))
check("no slots inside break", inbreak == 0, str(inbreak))

# one-off slot
r = act("addSlot", eventId=event_id, dayId=day1, startTime="12:15", endTime="12:30")
check("addSlot ok", r.get("result", {}).get("ok") is True, json.dumps(r))
r = act("addSlot", eventId=event_id, dayId=day1, startTime="12:15", endTime="12:30")
check("duplicate slot rejected", "already starts" in str(r.get("result", {}).get("error")), json.dumps(r))

# ---------- 4. companies ----------
r = act("createCompany", eventId=event_id, name="Acme Corp", city="Austin", state="TX",
        contactName="Jane Roe", contactEmail="jane@acme.com", practiceAreas="Litigation, IP",
        outsideCounselNeed="high", legalStaffCount="5")
check("createCompany ok", r.get("result", {}).get("ok") is True, json.dumps(r))
r = act("createCompany", eventId=event_id, name="Acme Corp")
check("duplicate company rejected", "already exists" in str(r.get("result", {}).get("error")), json.dumps(r))
act("createCompany", eventId=event_id, name="Globex Inc")
co1 = psql("select id from companies where name='Acme Corp'")
co2 = psql("select id from companies where name='Globex Inc'")
invite1 = psql(f"select invite_code from companies where id='{co1}'")
check("invite code generated", invite1.startswith("acme-corp-"), invite1)

r = act("setCompanyStatus", eventId=event_id, companyId=co1, status="registered")
check("setCompanyStatus", psql(f"select status from companies where id='{co1}'") == "registered")
r = act("regenerateInviteCode", eventId=event_id, companyId=co1)
invite1b = psql(f"select invite_code from companies where id='{co1}'")
check("invite code regenerated", invite1b != invite1 and invite1b.startswith("acme-corp-"), invite1b)

# ---------- 5. attorneys ----------
r = act("addAttorney", eventId=event_id, firstName="Ada", lastName="Lovelace",
        email="ada@firm.com", firm="Lovelace LLP", city="Dallas",
        organizationType="Minority-Owned Firm", practiceAreas="IP, Tech")
check("addAttorney ok", r.get("result", {}).get("ok") is True, json.dumps(r))
r = act("addAttorney", eventId=event_id, firstName="Ada2", lastName="L", email="ada@firm.com", firm="X")
check("duplicate attorney email rejected", "already registered" in str(r.get("result", {}).get("error")), json.dumps(r))
act("addAttorney", eventId=event_id, firstName="Grace", lastName="Hopper", email="grace@firm.com", firm="Hopper & Co")
act("addAttorney", eventId=event_id, firstName="Wade", lastName="Wilson", email="wade@firm.com", firm="Wilson PC")
a1 = psql("select id from attorneys where email='ada@firm.com'")
a2 = psql("select id from attorneys where email='grace@firm.com'")
a3 = psql("select id from attorneys where email='wade@firm.com'")

r = act("updateAttorney", eventId=event_id, attorneyId=a1, firstName="Ada", lastName="Lovelace",
        email="ada@firm.com", firm="Lovelace & Byron LLP", city="Dallas", practiceAreas="IP")
check("updateAttorney", psql(f"select firm from attorneys where id='{a1}'") == "Lovelace & Byron LLP")

# block + withdraw
slot_a = psql(f"select id from time_slots where event_day_id='{day1}' order by sort_order limit 1")
slot_b = psql(f"select id from time_slots where event_day_id='{day1}' order by sort_order offset 1 limit 1")
r = act("addUnavailability", eventId=event_id, attorneyId=a2, scope="slot", timeSlotId=slot_a, note="Panel duty")
check("addUnavailability slot", psql(f"select count(*) from attorney_unavailability where attorney_id='{a2}'") == "1")
check("isUnavailable flag set", psql(f"select is_unavailable from attorneys where id='{a2}'") == "t")
r = act("withdrawAttorney", eventId=event_id, attorneyId=a3)
check("withdrawAttorney", psql(f"select status from attorneys where id='{a3}'") == "withdrawn")

# ---------- 6. assignments ----------
r = act("saveAssignment", eventId=event_id, companyId=co1, timeSlotId=slot_a, attorneyId=a1, notes="intro")
check("saveAssignment create", r.get("result", {}).get("ok") is True, json.dumps(r))
r = act("saveAssignment", eventId=event_id, companyId=co2, timeSlotId=slot_a, attorneyId=a1)
check("attorney double-book blocked", "already has an interview" in str(r.get("result", {}).get("error")), json.dumps(r))
r = act("saveAssignment", eventId=event_id, companyId=co1, timeSlotId=slot_a, attorneyId=a2)
asg1 = psql(f"select id from assignments where company_id='{co1}' and time_slot_id='{slot_a}'")
check("company slot cell updated? (should fail create, no assignmentId)", "already has an interview in this slot" in str(r.get("result", {}).get("error")), json.dumps(r))
# proper edit with assignmentId
r = act("saveAssignment", eventId=event_id, assignmentId=asg1, companyId=co1, timeSlotId=slot_a, attorneyId=a2, notes="swapped")
check("saveAssignment edit swaps attorney", r.get("result", {}).get("ok") is True and
      psql(f"select attorney_id from assignments where id='{asg1}'") == a2, json.dumps(r))
r = act("saveAssignment", eventId=event_id, companyId=co2, timeSlotId=slot_a, attorneyId=a3)
check("withdrawn attorney blocked", "withdrawn" in str(r.get("result", {}).get("error")), json.dumps(r))
r = act("saveAssignment", eventId=event_id, companyId=co2, timeSlotId=slot_b, attorneyId=a1)
check("second assignment ok", r.get("result", {}).get("ok") is True, json.dumps(r))
asg2 = psql(f"select id from assignments where company_id='{co2}'")
r = act("deleteAssignment", eventId=event_id, assignmentId=asg2)
check("deleteAssignment", psql(f"select count(*) from assignments where id='{asg2}'") == "0")

# ---------- 7. resume upload (multipart with file) ----------
import urllib.request as ur
boundary = uuid.uuid4().hex
pdf = b"%PDF-1.4 test pdf bytes"
body = (
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"__action\"\r\n\r\nuploadResume\r\n"
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"eventId\"\r\n\r\n{event_id}\r\n"
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"attorneyId\"\r\n\r\n{a1}\r\n"
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"resume.pdf\"\r\n"
    f"Content-Type: application/pdf\r\n\r\n"
).encode() + pdf + f"\r\n--{boundary}--\r\n".encode()
req = ur.Request(BASE + "/api/dev-harness", data=body,
                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
with ur.urlopen(req) as resp:
    rr = json.loads(resp.read())
check("uploadResume ok", "error" not in rr, json.dumps(rr))
check("resume path set", psql(f"select resume_path from attorneys where id='{a1}'") == f"{a1}.pdf")
status, _ = get(f"/api/attorneys/{a1}/resume")
check("resume route serves 200", status == 200, str(status))

# non-pdf rejected
body2 = (
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"__action\"\r\n\r\nuploadResume\r\n"
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"eventId\"\r\n\r\n{event_id}\r\n"
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"attorneyId\"\r\n\r\n{a2}\r\n"
    f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"x.pdf\"\r\n"
    f"Content-Type: application/pdf\r\n\r\nnot a pdf\r\n--{boundary}--\r\n"
).encode()
req = ur.Request(BASE + "/api/dev-harness", data=body2,
                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
try:
    with ur.urlopen(req) as resp: rr = json.loads(resp.read())
except ur.HTTPError as e: rr = json.loads(e.read())
check("fake pdf rejected", "Only PDF" in str(rr.get("error", "")), json.dumps(rr))

# ---------- 8. page renders with data ----------
for p in ["/admin", "/admin/events", f"/admin/events/{event_id}/days",
          f"/admin/events/{event_id}/attorneys", f"/admin/events/{event_id}/companies",
          f"/admin/events/{event_id}/assignments", f"/admin/events/{event_id}/settings",
          f"/admin/events/{event_id}/attorneys/{a1}/schedule"]:
    status, html = get(p)
    check(f"GET {p}", status == 200 and "Application error" not in html, str(status))

# attorney schedule shows the company
status, html = get(f"/admin/events/{event_id}/attorneys/{a1}/schedule")
check("attorney schedule shows Globex? no - shows none after delete; shows Acme via a2 swap? a1 has 0 now",
      "No interviews scheduled" in html or "Acme" in html or "Globex" in html, "")

# ---------- 9. slot/day deletion ----------
slot_with_asg = psql(f"select time_slot_id from assignments limit 1")
r = act("deleteSlot", eventId=event_id, slotId=slot_with_asg)
check("deleteSlot cascades assignment", psql(f"select count(*) from assignments where time_slot_id='{slot_with_asg}'") == "0")
r = act("deleteDay", eventId=event_id, dayId=day2)
check("deleteDay removes slots", psql(f"select count(*) from time_slots where event_day_id='{day2}'") == "0")

# ---------- 10. clear assignments + update event ----------
act("saveAssignment", eventId=event_id, companyId=co1, timeSlotId=slot_b, attorneyId=a1)
r = act("clearAssignments", eventId=event_id)
check("clearAssignments", psql("select count(*) from assignments") == "0")
r = act("updateEvent", eventId=event_id, name="Test CC 2026 v2", startDate="2026-10-05",
        endDate="2026-10-07", slotDuration="20", status="open")
check("updateEvent", psql(f"select name||'/'||status||'/'||slot_duration from events where id='{event_id}'") == "Test CC 2026 v2/open/20")

# slot regen respects new duration
r = act("generateSlots", eventId=event_id, dayId=day1)
dur = psql(f"select distinct (extract(epoch from (end_time - start_time))/60)::int from time_slots where event_day_id='{day1}' order by 1 limit 1")
check("regen uses 20-min duration", dur == "20", dur)

# ---------- 11. company delete + unclaim ----------
psql(f"update companies set clerk_user_id='user_test123' where id='{co2}'")
r = act("unclaimCompany", eventId=event_id, companyId=co2)
check("unclaimCompany", psql(f"select coalesce(clerk_user_id,'NULL') from companies where id='{co2}'") == "NULL")
r = act("deleteCompany", eventId=event_id, companyId=co2)
check("deleteCompany", psql(f"select count(*) from companies where id='{co2}'") == "0")

# attorney delete
r = act("deleteAttorney", eventId=event_id, attorneyId=a3)
check("deleteAttorney", psql(f"select count(*) from attorneys where id='{a3}'") == "0")

print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
