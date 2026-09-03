import { getRole } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/spreadsheet-safe";
import {
  applyRosterImport,
  correctRosterPreview,
  stageRosterPreview,
} from "@/lib/roster-import/service";
import type { ApplyDecision, ColumnMapping, PercentFormat } from "@/lib/roster-import/types";
import { inspectWorkbook } from "@/lib/roster-import/workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(error: unknown, status = 400): Response {
  const message = error instanceof Error ? error.message : "Roster import failed.";
  return Response.json({ error: message }, { status });
}

async function requireAdmin(): Promise<Response | null> {
  return (await getRole()) === "admin" ? null : Response.json({ error: "Admin access required." }, { status: 403 });
}

function parseJsonField<T>(form: FormData, key: string): T {
  const value = form.get(key);
  if (typeof value !== "string") throw new Error(`${key} is required.`);
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`${key} is invalid.`);
  }
}

function fileFromForm(form: FormData, key: string, required: boolean): File | null {
  const value = form.get(key);
  if (value instanceof File && value.size > 0) return value;
  if (required) throw new Error("Choose a roster workbook.");
  return null;
}

async function bytes(file: File): Promise<Buffer> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Workbook exceeds the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit.`);
  return Buffer.from(await file.arrayBuffer());
}

function publicInspection(inspection: ReturnType<typeof inspectWorkbook>) {
  return {
    sheetName: inspection.sheetName,
    headers: inspection.headers,
    rowCount: inspection.rows.length,
    suggestedMapping: inspection.suggestedMapping,
    suggestedPercentFormat: inspection.suggestedPercentFormat,
    percentExample: inspection.percentExample,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<Response> {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { eventId } = await params;
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      if (body.action === "correct") {
        const result = await correctRosterPreview({
          eventId,
          importId: String(body.importId ?? ""),
          candidateId: String(body.candidateId ?? ""),
          correctedEmail: body.correctedEmail === undefined ? undefined : String(body.correctedEmail || "") || null,
          manualAttorneyId: body.manualAttorneyId === undefined ? undefined : String(body.manualAttorneyId || "") || null,
        });
        return Response.json(result);
      }
      if (body.action === "apply") {
        const result = await applyRosterImport({
          eventId,
          importId: String(body.importId ?? ""),
          decisions: Array.isArray(body.decisions)
            ? body.decisions.map((item) => {
                const candidate = item as Record<string, unknown>;
                return { candidateId: String(candidate.candidateId ?? ""), decision: String(candidate.decision ?? "") as ApplyDecision };
              })
            : [],
          corrections: Array.isArray(body.corrections)
            ? body.corrections.map((item) => {
                const correction = item as Record<string, unknown>;
                return { candidateId: String(correction.candidateId ?? ""), correctedEmail: String(correction.correctedEmail ?? "") };
              })
            : undefined,
        });
        return Response.json(result);
      }
      throw new Error("Unknown roster import action.");
    }

    const form = await request.formData();
    const action = form.get("action");
    const rosterFile = fileFromForm(form, "roster", true)!;
    const rosterBytes = await bytes(rosterFile);
    const inspection = inspectWorkbook(rosterBytes, rosterFile);
    if (action === "inspect") return Response.json(publicInspection(inspection));
    if (action !== "stage") throw new Error("Unknown roster upload action.");

    const mapping = parseJsonField<ColumnMapping>(form, "mapping");
    const percentFormat = form.get("percentFormat") as PercentFormat;
    if (percentFormat !== "fraction" && percentFormat !== "whole") throw new Error("Confirm whether percentages are fractions or whole numbers.");
    const companionFile = fileFromForm(form, "companion", false);
    const useCompanion = form.get("useCompanion") === "true";
    let companion = null;
    let companionMapping: ColumnMapping | null = null;
    if (useCompanion) {
      if (!companionFile) throw new Error("Choose the companion workbook or turn off the companion join.");
      companion = inspectWorkbook(await bytes(companionFile), companionFile, { allSheets: true });
      companionMapping = parseJsonField<ColumnMapping>(form, "companionMapping");
    }
    const result = await stageRosterPreview({
      eventId,
      uploadedBy: "verified-admin-session",
      filename: rosterFile.name,
      fileBytes: rosterBytes,
      inspection,
      mapping,
      percentFormat,
      companion,
      companionMapping,
    });
    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}
