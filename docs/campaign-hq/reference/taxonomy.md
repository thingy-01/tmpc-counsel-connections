# Canonical attorney taxonomy

Source of truth: `data/02-registration/02_TMCP 2025 Registration Form.pdf`, extracted with
`pdftotext -layout`. This file is the single source for practice areas and organization
types. Do not re-derive the list from the 2025 roster spreadsheet.

## Why this matters

The 2025 roster workbook (`03C_Breakdown of Law Firm Attorneys`) contains only the values
that were *observed* last year. It is not the dropdown list. Concretely:

- The roster is missing `Taxation`, which the form offers.
- The roster contains `Not Applicable`, which the form does not offer.
- Several roster labels are longer variants of the form labels
  (`International Law` vs `International`, `Appellate Practice` vs `Appellate`,
  `Immigration Law` vs `Immigration`, `Labor & Employment Law` vs `Labor & Employment`,
  `Personal Injury/Tort Litigation` vs `Personal Injury/Tort Lit`).

Treat the form values as canonical for new input, and treat roster values as legacy data
that must keep working.

## Practice areas (18, form section 2)

```
Antitrust
Appellate
Commercial Litigation
Corporate
Finance
Government
Health Care
Immigration
Intellectual Property
International
Labor & Employment
Oil, Gas & Mineral
Personal Injury/Tort Lit
Privacy/Cybersecurity
Real Estate/Construction
Regulatory
Securities
Taxation
```

Form rule, quoted exactly:

> Your Practice Area: Indicate your top TWO practice areas below by filling in the blank(s)
> with % of total practice. Percentages MUST add up to 100%.

Section 1 also has `Practice Area (select ONE from list in section 2 below)`, so the same
list governs the single-value case.

## Organization / company types (form section 1)

```
Law Firm: Majority-owned
Law Firm: Minority or woman-owned
Corporation (not law firm)
Government Agency
Judiciary
Other
```

Form footnote, quoted exactly:

> A minority/woman-owned law firm is one in which at least 51 percent of the ownership
> interest is controlled by minority/women attorneys.

The roster additionally contains `Majority-owned law firm`, `Minority or Woman-owned law
firm` (and a lowercase `woman-owned` variant), and `None`. These are legacy values.

## Compatibility rules

1. Offer only canonical values for new and edited entries.
2. Never rewrite, drop, or silently remap a stored legacy value. Display it as-is.
3. Match legacy values case-insensitively when deciding whether a stored value already
   corresponds to a canonical option.
4. Do not invent percentages. If stored data has an area with no percentage, keep it
   absent and mark the record incomplete. Do not default to 100%.
5. Do not force existing records with more than two areas down to two. Flag them.
6. Enforce the two-area maximum and the 100% sum only on newly submitted edits, and say
   so in the validation message.
