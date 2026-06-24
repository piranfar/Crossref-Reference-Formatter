"use client";

import { forwardRef } from "react";

interface ReferenceInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Larger textarea for the pre-conversion input state. */
  prominent?: boolean;
}

/**
 * Textarea for pasting Crossref reference blocks.
 */
const ReferenceInput = forwardRef<HTMLTextAreaElement, ReferenceInputProps>(
  function ReferenceInput(
    { value, onChange, disabled = false, prominent = false },
    ref
  ) {
    return (
      <div className="flex h-full flex-col">
        <label
          htmlFor="reference-input"
          className="mb-2 text-sm font-medium text-slate-700"
        >
          Paste references
        </label>
        <textarea
          ref={ref}
          id="reference-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={`1. Author A, Author B. Title. Journal. 2021;10(12):1508.\nhttps://doi.org/10.xxxx/xxxxx\nPMID:12345678 PMCID:PMC1234567\n\n2. Author C. Another title. Journal. 2020;5(3):100-110.\nDOI:10.xxxx/yyyyy`}
          className={`flex-1 resize-y rounded-lg border border-slate-300 bg-white p-4 font-mono text-sm leading-relaxed text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 ${
            prominent ? "min-h-[480px]" : "min-h-[420px]"
          }`}
        />
      </div>
    );
  }
);

export default ReferenceInput;
