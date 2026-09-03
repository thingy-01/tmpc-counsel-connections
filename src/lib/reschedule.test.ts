import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { constraintViolated } from "./db/errors";
import {
  atomicRescheduleStatement,
  canTransitionRescheduleRequest,
  effectiveRescheduleStatus,
  RESCHEDULE_STATUSES,
  type RescheduleActor,
  type RescheduleStatus,
} from "./reschedule";

const allowed = new Set([
  "staff:open:in_review",
  "staff:open:resolved_declined",
  "staff:open:resolved_rescheduled",
  "staff:in_review:open",
  "staff:in_review:resolved_declined",
  "staff:in_review:resolved_rescheduled",
  "attorney:open:withdrawn",
  "attorney:in_review:withdrawn",
  "system:open:superseded",
  "system:in_review:superseded",
]);

test("the transition guard permits exactly the approved actor/status moves", () => {
  const actors: RescheduleActor[] = ["staff", "attorney", "system"];
  for (const actor of actors) {
    for (const from of RESCHEDULE_STATUSES) {
      for (const to of RESCHEDULE_STATUSES) {
        assert.equal(
          canTransitionRescheduleRequest(actor, from, to),
          allowed.has(`${actor}:${from}:${to}`),
          `${actor} ${from} -> ${to}`
        );
      }
    }
  }
});

test(
  "the database atomically preserves conflicts and resolves a valid closed-event move",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const database = drizzle(pool);
    const eventId = randomUUID();
    const dayId = randomUUID();
    const attorneyId = randomUUID();
    const otherAttorneyId = randomUUID();
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const slotIds = Array.from({ length: 4 }, () => randomUUID());
    const assignmentId = randomUUID();
    const companyConflictAssignmentId = randomUUID();
    const attorneyConflictAssignmentId = randomUUID();
    const requestId = randomUUID();

    try {
      await database.execute(sql`
        insert into events (id, name, start_date, end_date, status)
        values (${eventId}::uuid, 'Atomic test', '2030-01-01', '2030-01-01', 'closed')
      `);
      await database.execute(sql`
        insert into event_days (
          id, event_id, date, label, format, start_time, end_time
        ) values (
          ${dayId}::uuid, ${eventId}::uuid, '2030-01-01', 'Test day',
          'virtual', '09:00', '10:00'
        )
      `);
      await database.execute(sql`
        insert into time_slots (
          id, event_day_id, start_time, end_time, sort_order
        ) values
          (${slotIds[0]}::uuid, ${dayId}::uuid, '09:00', '09:15', 0),
          (${slotIds[1]}::uuid, ${dayId}::uuid, '09:15', '09:30', 1),
          (${slotIds[2]}::uuid, ${dayId}::uuid, '09:30', '09:45', 2),
          (${slotIds[3]}::uuid, ${dayId}::uuid, '09:45', '10:00', 3)
      `);
      await database.execute(sql`
        insert into attorneys (
          id, event_id, first_name, last_name, email, firm
        ) values
          (${attorneyId}::uuid, ${eventId}::uuid, 'A', 'Attorney', ${`${attorneyId}@example.invalid`}, 'Firm'),
          (${otherAttorneyId}::uuid, ${eventId}::uuid, 'B', 'Attorney', ${`${otherAttorneyId}@example.invalid`}, 'Firm')
      `);
      await database.execute(sql`
        insert into companies (id, event_id, name) values
          (${companyId}::uuid, ${eventId}::uuid, ${`Company ${companyId}`}),
          (${otherCompanyId}::uuid, ${eventId}::uuid, ${`Company ${otherCompanyId}`})
      `);
      await database.execute(sql`
        insert into assignments (
          id, company_id, attorney_id, time_slot_id, source, status
        ) values
          (${assignmentId}::uuid, ${companyId}::uuid, ${attorneyId}::uuid, ${slotIds[0]}::uuid, 'admin', 'confirmed'),
          (${companyConflictAssignmentId}::uuid, ${companyId}::uuid, ${otherAttorneyId}::uuid, ${slotIds[1]}::uuid, 'admin', 'confirmed'),
          (${attorneyConflictAssignmentId}::uuid, ${otherCompanyId}::uuid, ${attorneyId}::uuid, ${slotIds[2]}::uuid, 'admin', 'confirmed')
      `);
      await database.execute(sql`
        insert into attorney_reschedule_requests (
          id, assignment_id, attorney_id, event_id, reason, snapshot
        ) values (
          ${requestId}::uuid, ${assignmentId}::uuid, ${attorneyId}::uuid,
          ${eventId}::uuid, 'Need a change',
            '{"companyName":"Snapshot survives"}'::jsonb
        )
      `);

      const before = await database.execute<{ assignment: unknown; request: unknown }>(sql`
        select to_jsonb(assignment.*) as assignment, to_jsonb(request.*) as request
        from assignments assignment, attorney_reschedule_requests request
        where assignment.id = ${assignmentId}::uuid and request.id = ${requestId}::uuid
      `);

      await assert.rejects(
        database.execute(
          atomicRescheduleStatement({
            eventId,
            requestId,
            newSlotId: slotIds[1],
            actorId: "test-staff",
          })
        ),
        (error) =>
          constraintViolated(error, "assignments_company_slot_unique")
      );
      const afterCompanyConflict = await database.execute<{
        assignment: unknown;
        request: unknown;
      }>(sql`
        select to_jsonb(assignment.*) as assignment, to_jsonb(request.*) as request
        from assignments assignment, attorney_reschedule_requests request
        where assignment.id = ${assignmentId}::uuid and request.id = ${requestId}::uuid
      `);
      assert.deepEqual(afterCompanyConflict.rows[0], before.rows[0]);

      await assert.rejects(
        database.execute(
          atomicRescheduleStatement({
            eventId,
            requestId,
            newSlotId: slotIds[2],
            actorId: "test-staff",
          })
        ),
        (error) =>
          constraintViolated(error, "assignments_attorney_slot_unique")
      );
      const afterAttorneyConflict = await database.execute<{
        assignment: unknown;
        request: unknown;
      }>(sql`
        select to_jsonb(assignment.*) as assignment, to_jsonb(request.*) as request
        from assignments assignment, attorney_reschedule_requests request
        where assignment.id = ${assignmentId}::uuid and request.id = ${requestId}::uuid
      `);
      assert.deepEqual(afterAttorneyConflict.rows[0], before.rows[0]);

      const success = await database.execute<{
        moved: string;
        resolved: string;
      }>(
        atomicRescheduleStatement({
          eventId,
          requestId,
          newSlotId: slotIds[3],
          actorId: "test-staff",
        })
      );
      assert.equal(Number(success.rows[0]?.moved), 1);
      assert.equal(Number(success.rows[0]?.resolved), 1);

      const final = await database.execute<{
        timeSlotId: string;
        status: string;
        resolutionAssignmentId: string;
      }>(sql`
        select assignment.time_slot_id as "timeSlotId",
               request.status,
               request.resolution_assignment_id as "resolutionAssignmentId"
        from assignments assignment, attorney_reschedule_requests request
        where assignment.id = ${assignmentId}::uuid and request.id = ${requestId}::uuid
      `);
      assert.deepEqual(final.rows[0], {
        timeSlotId: slotIds[3],
        status: "resolved_rescheduled",
        resolutionAssignmentId: assignmentId,
      });

      const assignmentBeforeRequests = await database.execute<{
        assignment: unknown;
      }>(sql`
        select to_jsonb(assignment.*) as assignment
        from assignments assignment where assignment.id = ${assignmentId}::uuid
      `);
      const concurrentRequestIds = Array.from({ length: 10 }, () => randomUUID());
      const attempts = await Promise.allSettled(
        concurrentRequestIds.map((candidateId) =>
          database.execute(sql`
            insert into attorney_reschedule_requests (
              id, assignment_id, attorney_id, event_id, reason, snapshot
            ) values (
              ${candidateId}::uuid, ${assignmentId}::uuid, ${attorneyId}::uuid,
              ${eventId}::uuid, 'Concurrent request',
              '{"companyName":"Snapshot survives deletion"}'::jsonb
            )
          `)
        )
      );
      assert.equal(
        attempts.filter((attempt) => attempt.status === "fulfilled").length,
        1
      );
      for (const attempt of attempts.filter(
        (item) => item.status === "rejected"
      )) {
        assert.equal(
          constraintViolated(
            (attempt as PromiseRejectedResult).reason,
            "attorney_reschedule_requests_active_unique"
          ),
          true
        );
      }

      const assignmentAfterRequests = await database.execute<{
        assignment: unknown;
      }>(sql`
        select to_jsonb(assignment.*) as assignment
        from assignments assignment where assignment.id = ${assignmentId}::uuid
      `);
      assert.deepEqual(
        assignmentAfterRequests.rows[0],
        assignmentBeforeRequests.rows[0],
        "submitting requests must not modify the booking"
      );
      const winningIndex = attempts.findIndex(
        (attempt) => attempt.status === "fulfilled"
      );
      const activeRequestId = concurrentRequestIds[winningIndex];
      await database.execute(
        sql`delete from assignments where id = ${assignmentId}::uuid`
      );
      const superseded = await database.execute<{
        assignmentId: string | null;
        status: string;
        snapshot: { companyName?: string };
      }>(sql`
        select assignment_id as "assignmentId", status, snapshot
        from attorney_reschedule_requests where id = ${activeRequestId}::uuid
      `);
      assert.equal(superseded.rows[0]?.assignmentId, null);
      assert.equal(superseded.rows[0]?.status, "open");
      assert.equal(
        superseded.rows[0]?.snapshot.companyName,
        "Snapshot survives deletion"
      );
      assert.equal(
        effectiveRescheduleStatus(
          superseded.rows[0]?.status as RescheduleStatus,
          superseded.rows[0]?.assignmentId ?? null
        ),
        "superseded"
      );
    } finally {
      await database.execute(sql`delete from events where id = ${eventId}::uuid`);
      await pool.end();
    }
  }
);

test("an active request whose assignment disappeared reads as superseded", () => {
  assert.equal(effectiveRescheduleStatus("open", null), "superseded");
  assert.equal(effectiveRescheduleStatus("in_review", null), "superseded");
  for (const status of RESCHEDULE_STATUSES.filter(
    (item) => item !== "open" && item !== "in_review"
  )) {
    assert.equal(
      effectiveRescheduleStatus(status as RescheduleStatus, null),
      status
    );
  }
  assert.equal(effectiveRescheduleStatus("open", "assignment"), "open");
});
