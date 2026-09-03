"use client";

export default function PrintButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 ${className}`}
    >
      Print page
    </button>
  );
}
