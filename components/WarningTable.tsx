"use client";

import type { WarningEntry } from "@/types/reference";

interface WarningTableProps {
  warnings: WarningEntry[];
}

/**
 * Bottom section table listing references with unresolved or partial identifiers.
 */
export default function WarningTable({ warnings }: WarningTableProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-amber-800">
        Warnings ({warnings.length})
      </h2>
      <p className="mb-4 text-sm text-slate-600">
        The following references could not be fully resolved. Missing identifiers
        are omitted from the output rather than shown as placeholders.
      </p>
      <div className="overflow-x-auto rounded-lg border border-amber-200 shadow-sm">
        <table className="min-w-full divide-y divide-amber-200 text-sm">
          <thead className="bg-amber-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-amber-900">
                #
              </th>
              <th className="px-4 py-3 text-left font-semibold text-amber-900">
                Citation
              </th>
              <th className="px-4 py-3 text-left font-semibold text-amber-900">
                Issues
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100 bg-white">
            {warnings.map((entry) => (
              <tr key={entry.number} className="hover:bg-amber-50/50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-700">
                  {entry.number}
                </td>
                <td className="max-w-md px-4 py-3 text-slate-600">
                  {entry.citationPreview}
                </td>
                <td className="px-4 py-3 text-amber-800">
                  <ul className="list-inside list-disc space-y-1">
                    {entry.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
