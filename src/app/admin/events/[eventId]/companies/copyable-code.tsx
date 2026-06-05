"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Shows a code in monospace with a one-click copy button. */
export default function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — selecting the text still works as a fallback.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy invite code"
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700 transition-colors hover:bg-slate-100"
    >
      {code}
      {copied ? (
        <Check className="size-3 text-emerald-600" />
      ) : (
        <Copy className="size-3 text-slate-400" />
      )}
    </button>
  );
}
