/**
 * Canonical attorney taxonomy from the 2025 registration form.
 *
 * New input must use these exact labels. Imported labels are deliberately not
 * remapped: callers should pass stored JSON through `parsePracticeAreas` and
 * display the returned `area` values verbatim.
 */
export const PRACTICE_AREAS = [
  "Antitrust",
  "Appellate",
  "Commercial Litigation",
  "Corporate",
  "Finance",
  "Government",
  "Health Care",
  "Immigration",
  "Intellectual Property",
  "International",
  "Labor & Employment",
  "Oil, Gas & Mineral",
  "Personal Injury/Tort Lit",
  "Privacy/Cybersecurity",
  "Real Estate/Construction",
  "Regulatory",
  "Securities",
  "Taxation",
] as const;

export const ORGANIZATION_TYPES = [
  "Law Firm: Majority-owned",
  "Law Firm: Minority or woman-owned",
  "Corporation (not law firm)",
  "Government Agency",
  "Judiciary",
  "Other",
] as const;

export type CanonicalPracticeArea = (typeof PRACTICE_AREAS)[number];
export type CanonicalOrganizationType = (typeof ORGANIZATION_TYPES)[number];

/** A normalized area. Missing percentages remain missing; they are never inferred. */
export type PracticeAreaEntry = {
  area: string;
  percent?: number;
};

export type SerializedPracticeAreaEntry = PracticeAreaEntry & {
  percentScale?: "whole" | "fraction";
};

export type ParsedPracticeAreas = {
  entries: PracticeAreaEntry[];
  percentageFormat: "fraction" | "whole";
  hasMissingPercentages: boolean;
  hasMoreThanTwoAreas: boolean;
  hasAmbiguousLegacyScale: boolean;
  hasInvalidPercentageTotal: boolean;
  incomplete: boolean;
};

export type PracticeAreaParseOptions = {
  /**
   * Spreadsheet imports must declare their scale. Database reads may use
   * `auto`, which recognizes legacy seeded records as fractional when supplied
   * values are in 0..1 and total approximately 1. New form input must use
   * `whole` semantics.
   */
  percentageFormat?: "auto" | "fraction" | "whole";
};

/**
 * Read either supported database shape (`string[]` or `{area, percent}[]`).
 * Labels are preserved exactly. Valid numeric percentages are normalized to
 * whole-percent display values according to the declared/detected format.
 * Unknown labels are data, not aliases, so they are never canonicalized.
 */
export function parsePracticeAreas(
  value: unknown,
  options: PracticeAreaParseOptions = {}
): ParsedPracticeAreas {
  const entries: PracticeAreaEntry[] = [];
  const declaredScales = new Set<"fraction" | "whole">();

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        if (item.trim()) entries.push({ area: item });
        continue;
      }

      if (!item || typeof item !== "object") continue;
      const candidate = item as {
        area?: unknown;
        percent?: unknown;
        percentScale?: unknown;
      };
      if (typeof candidate.area !== "string") continue;
      if (!candidate.area.trim()) continue;
      const area = candidate.area;

      if (
        typeof candidate.percent === "number" &&
        Number.isFinite(candidate.percent)
      ) {
        entries.push({ area, percent: candidate.percent });
        if (
          candidate.percentScale === "fraction" ||
          candidate.percentScale === "whole"
        ) {
          declaredScales.add(candidate.percentScale);
        }
      } else {
        entries.push({ area });
      }
    }
  }

  const suppliedPercentages = entries.flatMap((entry) =>
    entry.percent === undefined ? [] : [entry.percent]
  );
  const suppliedTotal = suppliedPercentages.reduce(
    (total, percent) => total + percent,
    0
  );
  const autoDetectPercentageFormat =
    options.percentageFormat === undefined ||
    options.percentageFormat === "auto";
  const isUnmarkedLegacyFraction =
    autoDetectPercentageFormat &&
    declaredScales.size === 0 &&
    suppliedPercentages.length > 0 &&
    suppliedPercentages.every((percent) => percent >= 0 && percent <= 1) &&
    Math.abs(suppliedTotal - 1) <= 0.000001;
  const percentageFormat =
    options.percentageFormat === "fraction" ||
    (options.percentageFormat !== "whole" &&
      !declaredScales.has("whole") &&
      (declaredScales.has("fraction") || isUnmarkedLegacyFraction))
      ? "fraction"
      : "whole";

  if (percentageFormat === "fraction") {
    for (const entry of entries) {
      if (entry.percent !== undefined) {
        entry.percent = Number((entry.percent * 100).toFixed(10));
      }
    }
  }

  const hasMissingPercentages = entries.some(
    (entry) => entry.percent === undefined
  );
  const hasMoreThanTwoAreas = entries.length > 2;
  const normalizedTotal = entries.reduce(
    (total, entry) => total + (entry.percent ?? 0),
    0
  );
  const hasInvalidPercentageTotal =
    entries.length > 0 &&
    !hasMissingPercentages &&
    Math.abs(normalizedTotal - 100) > 0.000001;
  const hasAmbiguousLegacyScale =
    autoDetectPercentageFormat &&
    declaredScales.size === 0 &&
    suppliedPercentages.length > 0 &&
    suppliedPercentages.every((percent) => percent >= 0 && percent <= 1) &&
    !isUnmarkedLegacyFraction;

  return {
    entries,
    percentageFormat,
    hasMissingPercentages,
    hasMoreThanTwoAreas,
    hasAmbiguousLegacyScale,
    hasInvalidPercentageTotal,
    incomplete:
      hasMissingPercentages ||
      hasMoreThanTwoAreas ||
      hasAmbiguousLegacyScale ||
      hasInvalidPercentageTotal,
  };
}

/**
 * Produce the one structured JSON shape used for new writes. Callers must
 * validate new submissions before serializing; this function intentionally
 * does not invent percentages, canonicalize labels, or limit the array.
 */
export function serializePracticeAreas(
  entries: readonly PracticeAreaEntry[]
): SerializedPracticeAreaEntry[] {
  return entries
    .map((entry) => {
      const area = entry.area;
      return entry.percent === undefined
        ? { area }
        : { area, percent: entry.percent, percentScale: "whole" as const };
    })
    .filter((entry) => entry.area.trim().length > 0);
}

/** Compare normalized editor values without trusting a client-side bypass flag. */
export function practiceAreaEntriesEqual(
  left: readonly PracticeAreaEntry[],
  right: readonly PracticeAreaEntry[]
): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const candidate = right[index];
    if (!candidate || entry.area !== candidate.area) return false;
    if (entry.percent === undefined || candidate.percent === undefined) {
      return entry.percent === candidate.percent;
    }
    return Math.abs(entry.percent - candidate.percent) <= 0.000001;
  });
}

/** Case-insensitive membership is for recognition only; it does not rewrite labels. */
export function isCanonicalPracticeArea(value: string): boolean {
  const normalized = value.toLocaleLowerCase("en-US");
  return PRACTICE_AREAS.some(
    (area) => area.toLocaleLowerCase("en-US") === normalized
  );
}

/** Case-insensitive membership is for recognition only; it does not rewrite labels. */
export function isCanonicalOrganizationType(value: string): boolean {
  const normalized = value.toLocaleLowerCase("en-US");
  return ORGANIZATION_TYPES.some(
    (type) => type.toLocaleLowerCase("en-US") === normalized
  );
}
