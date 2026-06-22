"use client";

export type CompanyFieldValues = {
  name?: string;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  legalStaffCount?: number | null;
  outsideCounselNeed?: string | null;
  practiceAreas?: unknown;
  contactName?: string | null;
  contactTitle?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500";

/**
 * The full company detail form fields, shared by the admin Manage dialog and
 * the company's own portal profile page. Set `includeName={false}` where the
 * name is fixed (e.g. the company can't rename itself).
 */
export default function CompanyFields({
  company,
  includeName = true,
}: {
  company?: CompanyFieldValues;
  includeName?: boolean;
}) {
  const areas = Array.isArray(company?.practiceAreas)
    ? (company!.practiceAreas as string[]).join(", ")
    : "";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {includeName && (
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Company name *
          </label>
          <input
            name="name"
            required
            defaultValue={company?.name ?? ""}
            className={inputClass}
          />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">City</label>
        <input name="city" defaultValue={company?.city ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">State</label>
        <input name="state" defaultValue={company?.state ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Website</label>
        <input name="website" defaultValue={company?.website ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Legal staff count
        </label>
        <input
          type="number"
          name="legalStaffCount"
          min={0}
          defaultValue={company?.legalStaffCount ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Outside counsel need
        </label>
        <select
          name="outsideCounselNeed"
          defaultValue={company?.outsideCounselNeed ?? ""}
          className={inputClass}
        >
          <option value="">Not set</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Practice areas (comma-separated)
        </label>
        <input
          name="practiceAreas"
          defaultValue={areas}
          placeholder="Litigation, M&A, IP"
          className={inputClass}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Description
        </label>
        <input
          name="description"
          defaultValue={company?.description ?? ""}
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact name</label>
        <input name="contactName" defaultValue={company?.contactName ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact title</label>
        <input name="contactTitle" defaultValue={company?.contactTitle ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact email</label>
        <input type="email" name="contactEmail" defaultValue={company?.contactEmail ?? ""} className={inputClass} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Contact phone</label>
        <input name="contactPhone" defaultValue={company?.contactPhone ?? ""} className={inputClass} />
      </div>
    </div>
  );
}
