import { parsePracticeAreas } from "@/lib/practice-areas";

export type PublicPracticeArea = {
  area: string;
  percent: number | null;
};

/** Minimal client-safe projection of the shared staff/company parser. */
export function publicPracticeAreas(value: unknown): PublicPracticeArea[] {
  return parsePracticeAreas(value).entries.map((entry) => ({
    area: entry.area,
    percent: entry.percent ?? null,
  }));
}
