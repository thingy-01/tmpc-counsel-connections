import { and, eq, ne, or, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getAttorneyIdentity, getCompanyId, getRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignments, attorneys, companies } from "@/lib/db/schema";
import { readResume } from "@/lib/storage";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function privateResponse(body: string, status: number): Response {
  return new Response(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getRole();

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateResponse("Not found", 404);

  let attorney:
    | { resumePath: string | null; resumeOriginalName: string | null }
    | undefined;

  if (role === "admin") {
    const rows = await db
      .select({
        resumePath: attorneys.resumePath,
        resumeOriginalName: attorneys.resumeOriginalName,
      })
      .from(attorneys)
      .where(eq(attorneys.id, id))
      .limit(1);
    attorney = rows[0];
  } else if (role === "company") {
    const companyId = await getCompanyId();
    if (!companyId) return privateResponse("Unauthorized", 401);

    const rows = await db
      .select({
        resumePath: attorneys.resumePath,
        resumeOriginalName: attorneys.resumeOriginalName,
      })
      .from(attorneys)
      .innerJoin(companies, eq(companies.eventId, attorneys.eventId))
      .where(
        and(
          eq(attorneys.id, id),
          eq(companies.id, companyId),
          or(
            ne(attorneys.status, "withdrawn"),
            sql`exists (
              select 1
              from ${assignments}
              where ${assignments.attorneyId} = ${attorneys.id}
                and ${assignments.companyId} = ${companies.id}
            )`
          )
        )
      )
      .limit(1);
    attorney = rows[0];
  } else {
    let identity;
    try {
      identity = await getAttorneyIdentity();
    } catch {
      return privateResponse("Unavailable", 503);
    }
    if (!identity) return privateResponse("Unauthorized", 401);
    if (identity.attorneyId !== id) return privateResponse("Forbidden", 403);

    const rows = await db
      .select({
        resumePath: attorneys.resumePath,
        resumeOriginalName: attorneys.resumeOriginalName,
      })
      .from(attorneys)
      .where(
        and(
          eq(attorneys.id, identity.attorneyId),
          eq(attorneys.eventId, identity.eventId)
        )
      )
      .limit(1);
    attorney = rows[0];
  }

  if (!attorney?.resumePath) return privateResponse("Not found", 404);

  let bytes: Buffer;
  try {
    bytes = await readResume(attorney.resumePath);
  } catch {
    return privateResponse("Not found", 404);
  }

  const filename = (attorney.resumeOriginalName ?? "resume.pdf")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .trim() || "resume.pdf";

  return new Response(new Uint8Array(bytes), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
