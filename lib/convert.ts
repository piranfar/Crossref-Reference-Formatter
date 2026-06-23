/**
 * Client-side conversion orchestrator for local and Crossref conversion modes.
 * Used in the static GitHub Pages build (no server API routes).
 */

import {
  createNihCache,
  enrichCrossrefIdentifiers,
  enrichReferencesLocal,
} from "@/lib/enrich";
import {
  type CrossrefCache,
  resolveCrossrefDoi,
} from "@/lib/crossref";
import {
  buildWarnings,
  formatAllHtml,
  formatAllPlain,
} from "@/lib/format";
import { parseReferences } from "@/lib/parser";
import type {
  ConversionResult,
  CrossrefProgressCallback,
  EnrichedReference,
  ParsedReference,
} from "@/types/reference";

const CROSSREF_CONCURRENCY = 2;

/**
 * Builds a ConversionResult from enriched references.
 */
function buildResult(enriched: EnrichedReference[]): ConversionResult {
  return {
    references: enriched,
    plainText: formatAllPlain(enriched),
    html: formatAllHtml(enriched),
    warnings: buildWarnings(enriched),
  };
}

/**
 * Fast local conversion: parse pasted text, NIH enrichment, format output.
 * Does not call Crossref.
 */
export async function convertReferencesLocal(
  input: string
): Promise<ConversionResult> {
  const parsed = parseReferences(input);
  const enriched = await enrichReferencesLocal(parsed);
  return buildResult(enriched);
}

/** @deprecated Use convertReferencesLocal */
export const convertReferences = convertReferencesLocal;

/**
 * Processes references with Crossref metadata lookup then NIH identifier enrichment.
 */
async function runCrossrefBatch(
  references: ParsedReference[],
  onProgress: CrossrefProgressCallback | undefined,
  crossrefCache: CrossrefCache,
  nihCache: ReturnType<typeof createNihCache>
): Promise<{
  enriched: EnrichedReference[];
  crossrefFailed: boolean;
}> {
  const enriched: EnrichedReference[] = new Array(references.length);
  let crossrefCompleted = 0;
  let nihCompleted = 0;
  let crossrefFailed = false;
  let index = 0;
  const total = references.length;

  async function processOne(refIndex: number): Promise<void> {
    const ref = references[refIndex];

    const crossref = await resolveCrossrefDoi(
      ref.cleanedCitationTextWithoutIdentifierLines,
      ref.doi,
      crossrefCache
    );

    if (crossref.failed) {
      console.warn("Crossref lookup failed for reference", ref.number);
      crossrefFailed = true;
    }

    crossrefCompleted++;
    onProgress?.("crossref", crossrefCompleted, total);

    const merged: ParsedReference = {
      ...ref,
      doi: crossref.doi ?? ref.doi,
      // Always preserve original pasted citation body for display.
      cleanedCitationTextWithoutIdentifierLines:
        ref.cleanedCitationTextWithoutIdentifierLines,
      citationText: ref.cleanedCitationTextWithoutIdentifierLines,
    };

    enriched[refIndex] = await enrichCrossrefIdentifiers(merged, nihCache);
    nihCompleted++;
    onProgress?.("nih", nihCompleted, total);
  }

  async function worker(): Promise<void> {
    while (index < references.length) {
      const i = index++;
      await processOne(i);
    }
  }

  const workers = Array.from(
    { length: Math.min(CROSSREF_CONCURRENCY, references.length) },
    () => worker()
  );
  await Promise.all(workers);

  return { enriched, crossrefFailed };
}

/**
 * Crossref conversion: Crossref metadata, NIH PMID/PMCID enrichment, format.
 */
export async function convertReferencesCrossref(
  input: string,
  onProgress?: CrossrefProgressCallback
): Promise<ConversionResult> {
  const parsed = parseReferences(input);
  const crossrefCache: CrossrefCache = new Map();
  const nihCache = createNihCache();

  const { enriched, crossrefFailed } = await runCrossrefBatch(
    parsed,
    onProgress,
    crossrefCache,
    nihCache
  );

  if (crossrefFailed) {
    console.warn(
      "Crossref lookup failed for some references; local formatting was used."
    );
  }

  return buildResult(enriched);
}
