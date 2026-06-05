import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Resume file storage adapter.
 *
 * Files live on a Railway Volume mounted at RESUME_STORAGE_DIR (e.g. /data/resumes).
 * In local dev it falls back to ./.uploads/resumes (gitignored).
 *
 * This is the single seam for resume storage — swap the body of these functions
 * to move to S3/R2 later without touching callers.
 */

function baseDir(): string {
  return process.env.RESUME_STORAGE_DIR || path.join(process.cwd(), ".uploads", "resumes");
}

/** Volume-relative path stored on the attorney row, e.g. "<attorneyId>.pdf". */
export function resumeRelativePath(attorneyId: string): string {
  return `${attorneyId}.pdf`;
}

function absolutePath(relativePath: string): string {
  // Guard against path traversal — only allow a bare filename.
  const safe = path.basename(relativePath);
  return path.join(baseDir(), safe);
}

export async function saveResume(
  attorneyId: string,
  bytes: Buffer
): Promise<string> {
  const relativePath = resumeRelativePath(attorneyId);
  const dir = baseDir();
  await mkdir(dir, { recursive: true });
  await writeFile(absolutePath(relativePath), bytes);
  return relativePath;
}

export async function readResume(relativePath: string): Promise<Buffer> {
  return readFile(absolutePath(relativePath));
}

export async function deleteResume(relativePath: string): Promise<void> {
  try {
    await unlink(absolutePath(relativePath));
  } catch (err: unknown) {
    // Ignore "file not found" — deleting an already-missing file is a no-op.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
}
