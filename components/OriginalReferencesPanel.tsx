"use client";

interface OriginalReferencesPanelProps {
  value: string;
  onChange: (value: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

/**
 * Collapsible panel showing the original pasted reference text after conversion.
 */
export default function OriginalReferencesPanel({
  value,
  onChange,
  isOpen,
  onToggle,
  disabled = false,
}: OriginalReferencesPanelProps) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <span className="text-sm font-medium text-slate-700">
          Original pasted references
        </span>
        <span
          className="text-slate-400 transition-transform duration-200"
          aria-hidden="true"
          style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-slate-200 p-4">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            readOnly={false}
            className="max-h-64 min-h-[160px] w-full resize-y rounded-lg border border-slate-300 bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      )}
    </section>
  );
}
