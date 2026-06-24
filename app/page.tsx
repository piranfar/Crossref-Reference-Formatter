"use client";

import { useCallback, useRef, useState } from "react";
import FormattedPreview from "@/components/FormattedPreview";
import OriginalReferencesPanel from "@/components/OriginalReferencesPanel";
import ReferenceInput from "@/components/ReferenceInput";
import { exportToDocx } from "@/lib/docxExport";
import { convertReferencesCrossref, convertReferencesLocal } from "@/lib/convert";
import { formatRichTextClipHtml } from "@/lib/format";
import type { EnrichedReference } from "@/types/reference";

/** Triggers a browser download for a Blob with the given filename. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Main page: input panel, formatted preview, and action buttons.
 */
export default function Home() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const [references, setReferences] = useState<EnrichedReference[]>([]);
  const [plainText, setPlainText] = useState("");
  const [html, setHtml] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [copyFeedbackError, setCopyFeedbackError] = useState(false);
  const [hasConverted, setHasConverted] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [crossrefProgress, setCrossrefProgress] = useState<{
    phase: "crossref" | "nih";
    current: number;
    total: number;
  } | null>(null);

  const progressMessage = crossrefProgress
    ? crossrefProgress.phase === "crossref"
      ? `Checking Crossref ${crossrefProgress.current} / ${crossrefProgress.total}...`
      : `Checking PubMed/PMC IDs ${crossrefProgress.current} / ${crossrefProgress.total}...`
    : null;

  const showCopyFeedback = (message: string, isError = false) => {
    setCopyFeedback(message);
    setCopyFeedbackError(isError);
    setTimeout(() => {
      setCopyFeedback(null);
      setCopyFeedbackError(false);
    }, 2500);
  };

  /** Fast local conversion: parse, NIH enrichment, format (no Crossref). */
  const handleConvert = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCrossrefProgress(null);

    try {
      const result = await convertReferencesLocal(input);
      setReferences(result.references);
      setPlainText(result.plainText);
      setHtml(result.html);
      setHasConverted(true);
      setShowOriginal(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setReferences([]);
      setPlainText("");
      setHtml("");
      setHasConverted(false);
      setShowOriginal(false);
    } finally {
      setIsLoading(false);
      setCrossrefProgress(null);
    }
  }, [input]);

  /** Crossref conversion: metadata lookup, NIH enrichment, Vancouver formatting. */
  const handleCrossrefConvert = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCrossrefProgress(null);

    try {
      const parsed = input.trim();
      if (!parsed) {
        throw new Error("Input is empty. Paste at least one numbered reference.");
      }

      const result = await convertReferencesCrossref(input, (phase, current, total) => {
        setCrossrefProgress({ phase, current, total });
      });

      setReferences(result.references);
      setPlainText(result.plainText);
      setHtml(result.html);
      setHasConverted(true);
      setShowOriginal(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      setReferences([]);
      setPlainText("");
      setHtml("");
      setHasConverted(false);
      setShowOriginal(false);
    } finally {
      setIsLoading(false);
      setCrossrefProgress(null);
    }
  }, [input]);

  /** Clears all state and returns the app to the initial paste view. */
  const handleReset = useCallback(() => {
    setInput("");
    setReferences([]);
    setPlainText("");
    setHtml("");
    setError(null);
    setCopyFeedback(null);
    setCopyFeedbackError(false);
    setHasConverted(false);
    setShowOriginal(false);
    setCrossrefProgress(null);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  /** Copies Vancouver-style plain text to the clipboard (no links). */
  const handleCopyPlainText = async () => {
    if (!plainText) return;
    try {
      await navigator.clipboard.writeText(plainText);
      showCopyFeedback("Plain text copied");
    } catch {
      showCopyFeedback("Copy failed", true);
    }
  };

  /** Copies rendered rich text with clickable hyperlinks to the clipboard. */
  const handleCopyRichText = async () => {
    if (references.length === 0) return;
    try {
      const richHtml = formatRichTextClipHtml(references);
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([richHtml], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      showCopyFeedback("Rich text copied with hyperlinks");
    } catch {
      showCopyFeedback("Copy failed", true);
    }
  };

  /** Downloads references as a Word document with hyperlinks. */
  const handleDownloadDocx = async () => {
    if (references.length === 0) return;
    const blob = await exportToDocx(references);
    downloadBlob(blob, "references.docx");
  };

  /** Downloads references as a standalone HTML file. */
  const handleDownloadHtml = () => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    downloadBlob(blob, "references.html");
  };

  const hasOutput = references.length > 0;
  const buttonsDisabled = isLoading || !input.trim();

  const buttonClass =
    "rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Crossref Reference Formatter
          </h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">
            Paste Crossref references and export Vancouver-style linked
            references
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Action buttons */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConvert}
            disabled={buttonsDisabled}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading && !crossrefProgress ? "Converting…" : "Convert"}
          </button>

          <button
            type="button"
            onClick={handleCrossrefConvert}
            disabled={buttonsDisabled}
            className="w-[190px] rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Crossref Convert
          </button>

          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading}
            className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset
          </button>

          <button
            type="button"
            onClick={handleCopyPlainText}
            disabled={!hasOutput || isLoading}
            className={buttonClass}
          >
            Copy Plain Text
          </button>

          <button
            type="button"
            onClick={handleCopyRichText}
            disabled={!hasOutput || isLoading}
            className={buttonClass}
          >
            Copy Rich Text
          </button>

          <button
            type="button"
            onClick={handleDownloadDocx}
            disabled={!hasOutput || isLoading}
            className={buttonClass}
          >
            Download .docx
          </button>

          <button
            type="button"
            onClick={handleDownloadHtml}
            disabled={!hasOutput || isLoading}
            className={buttonClass}
          >
            Download .html
          </button>

          {copyFeedback && (
            <span
              className={`text-sm font-medium ${
                copyFeedbackError ? "text-red-600" : "text-green-600"
              }`}
            >
              {copyFeedback}
            </span>
          )}
        </div>

        {progressMessage && (
          <p className="mb-4 text-sm text-slate-600">{progressMessage}</p>
        )}

        {!hasConverted ? (
          /* Before conversion: prominent paste area */
          <div className="mx-auto max-w-4xl">
            <ReferenceInput
              ref={inputRef}
              value={input}
              onChange={setInput}
              disabled={isLoading}
              prominent
            />
            {(isLoading || error) && (
              <div className="mt-6">
                <FormattedPreview
                  references={references}
                  isLoading={isLoading}
                  error={error}
                  fullWidth
                />
              </div>
            )}
          </div>
        ) : (
          /* After conversion: full-width preview, collapsible original input */
          <div className="space-y-6">
            <FormattedPreview
              references={references}
              isLoading={isLoading}
              error={error}
              fullWidth
            />

            <OriginalReferencesPanel
              value={input}
              onChange={setInput}
              isOpen={showOriginal}
              onToggle={() => setShowOriginal((prev) => !prev)}
              disabled={isLoading}
            />
          </div>
        )}
      </main>
    </div>
  );
}
