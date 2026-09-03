export type PublicPracticeArea = {
  area: string;
  percent: number | null;
};

/**
 * Scheduling-local compatibility helper. Legacy seeded XLSX values are
 * fractions (0.5 = 50%, 1 = 100%); newer form values are whole percentages.
 * Missing percentages stay missing rather than being invented.
 */
export function publicPracticeAreas(value: unknown): PublicPracticeArea[] {
  if (!Array.isArray(value)) return [];

  const result: PublicPracticeArea[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const area = item.trim();
      if (area) result.push({ area, percent: null });
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const raw = item as { area?: unknown; percent?: unknown };
    if (typeof raw.area !== "string" || !raw.area.trim()) continue;

    let percent: number | null = null;
    const parsed =
      typeof raw.percent === "number"
        ? raw.percent
        : typeof raw.percent === "string" && raw.percent.trim()
          ? Number(raw.percent)
          : Number.NaN;
    if (Number.isFinite(parsed) && parsed >= 0) {
      percent = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
    }

    result.push({ area: raw.area.trim(), percent });
  }
  return result;
}
