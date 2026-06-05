import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { attorneys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getRole } from "@/lib/auth";
import { readResume } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Any signed-in admin or company user may view resumes.
  const role = await getRole();
  if (!role) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attorney = await db.query.attorneys.findFirst({
    where: eq(attorneys.id, id),
    columns: { resumePath: true, resumeOriginalName: true },
  });

  if (!attorney?.resumePath) return new Response("Not found", { status: 404 });

  let bytes: Buffer;
  try {
    bytes = await readResume(attorney.resumePath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const filename = (attorney.resumeOriginalName ?? "resume.pdf").replace(/"/g, "");

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
