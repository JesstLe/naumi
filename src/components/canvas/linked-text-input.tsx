"use client";

import { ChevronDown, FileText } from "lucide-react";
import type { LinkedImageTextSource } from "@/lib/canvas/linked-image-text";

export function LinkedTextInput({ sources, error, english = false }: {
  sources: readonly LinkedImageTextSource[];
  error?: string | null;
  english?: boolean;
}) {
  if (!sources.length && !error) return null;

  return (
    <div data-testid="linked-text-input" className="min-w-0 space-y-2">
      {sources.length > 0 && (
        <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
            <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>{english ? "Text input" : "文字输入"}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 tabular-nums text-slate-600">{sources.length}</span>
            <ChevronDown aria-hidden="true" className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100">
            {sources.map(source => (
              <section key={source.id} className="select-text px-3 py-2.5">
                <h4 className="mb-1.5 break-words text-xs font-semibold text-slate-800">{source.title}</h4>
                <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{source.content}</p>
              </section>
            ))}
          </div>
        </details>
      )}
      {error && <p role="alert" className="select-text text-xs leading-relaxed text-rose-600">{error}</p>}
    </div>
  );
}
