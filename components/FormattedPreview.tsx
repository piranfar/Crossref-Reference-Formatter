"use client";

import { useEffect } from "react";
import type { EnrichedReference } from "@/types/reference";
import {
  buildReferenceIdentifiers,
  formatReferenceHtml,
} from "@/lib/format";

interface FormattedPreviewProps {
  references: EnrichedReference[];
  isLoading?: boolean;
  error?: string | null;
  /** When true, preview spans full width with editorial typography. */
  fullWidth?: boolean;
  /** Hide the empty placeholder (used before first conversion). */
  hidden?: boolean;
}

/**
 * Preview showing Vancouver-style references with clickable identifier links.
 */
export default function FormattedPreview({
  references,
  isLoading = false,
  error = null,
  fullWidth = false,
  hidden = false,
}: FormattedPreviewProps) {
  useEffect(() => {
    if (references.length > 0) {
      console.log(
        "Final converted references",
        references.map((ref) => ({
          number: ref.number,
          doi: ref.doi,
          pmid: ref.pmid,
          pmcid: ref.pmcid,
          identifiers: buildReferenceIdentifiers(ref).map((item) => item.text),
        }))
      );
    }
  }, [references]);

  if (hidden && references.length === 0 && !isLoading && !error) {
    return null;
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 ${
          fullWidth ? "min-h-[200px]" : "h-full min-h-[420px]"
        }`}
      >
        <p className="text-center text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-6 ${
          fullWidth ? "min-h-[280px]" : "h-full min-h-[420px]"
        }`}
      >
        <div className="text-center">
          <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-slate-600">
            Converting references and looking up identifiers…
          </p>
        </div>
      </div>
    );
  }

  if (references.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 ${
          fullWidth ? "min-h-[200px]" : "h-full min-h-[420px]"
        }`}
      >
        <p className="text-center text-sm text-slate-500">
          Formatted references will appear here after conversion.
        </p>
      </div>
    );
  }

  const containerClass = fullWidth
    ? "mx-auto w-full max-w-4xl"
    : "flex h-full flex-col";

  const contentClass = fullWidth
    ? "overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 text-base leading-loose text-slate-800 shadow-sm [&_a]:text-blue-600 [&_a]:no-underline hover:[&_a]:underline [&_p]:mb-5 [&_p:last-child]:mb-0"
    : "min-h-[420px] flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm [&_a]:text-blue-600 [&_a]:no-underline hover:[&_a]:underline [&_p]:mb-4 [&_p:last-child]:mb-0";

  return (
    <div className={containerClass}>
      <h2 className="mb-3 text-base font-semibold text-slate-800">
        Formatted Preview
      </h2>
      <div
        className={contentClass}
        dangerouslySetInnerHTML={{
          __html: references.map(formatReferenceHtml).join("\n"),
        }}
      />

      {/* Temporary debug: enriched identifier fields per reference */}
      <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <summary className="cursor-pointer font-medium">
          Debug: enriched identifiers
        </summary>
        <ul className="mt-2 space-y-2">
          {references.map((ref) => (
            <li key={ref.number}>
              <span className="font-semibold">#{ref.number}</span>{" "}
              DOI={ref.doi ?? "—"} | PMID={ref.pmid ?? "—"} | PMCID=
              {ref.pmcid ?? "—"}
              <div className="mt-1 text-slate-600">
                Rendered:{" "}
                {buildReferenceIdentifiers(ref)
                  .map((item) => item.text)
                  .join(" ") || "—"}
              </div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
