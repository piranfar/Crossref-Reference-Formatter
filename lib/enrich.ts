/**
 * Enriches parsed references via NIH PMC ID Converter (browser fetch).
 */

import {
  normalizeDoi,
  normalizePmid,
  normalizePmcid,
} from "@/lib/parser";
import type {
  EnrichedReference,
  NihConverterRecord,
  NihConverterResponse,
  ParsedReference,
} from "@/types/reference";

const NIH_CONVERTER_URL =
  "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/";
const PUBMED_ESEARCH_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const NIH_EMAIL = "vahhab.p@gmail.com";
const NIH_TOOL = "crossref-reference-formatter";
const API_TIMEOUT_MS = 15_000;
const CONCURRENCY_LIMIT = 3;

/** In-memory cache scoped to one conversion request. */
export type IdCache = Map<string, { doi?: string; pmid?: string; pmcid?: string }>;

export interface IdentifierSet {
  doi?: string;
  pmid?: string;
  pmcid?: string;
}

/**
 * Merges NIH converter results with original identifiers.
 * Keeps pasted values; fills in only missing DOI/PMID/PMCID from NIH.
 */
export function mergeNihIdentifiers(
  original: IdentifierSet,
  nih: IdentifierSet
): IdentifierSet {
  return {
    doi: original.doi || nih.doi,
    pmid: original.pmid || nih.pmid,
    pmcid: original.pmcid || nih.pmcid,
  };
}

/**
 * Merges a NIH record into an identifier set using lowercase record fields.
 */
function mergeRecordIntoIds(
  record: NihConverterRecord | undefined,
  input: IdentifierSet
): IdentifierSet {
  if (!record) return input;

  return {
    doi: normalizeDoi(record.doi || input.doi || "") || input.doi,
    pmid:
      normalizePmid(String(record.pmid ?? input.pmid ?? "")) || input.pmid,
    pmcid: normalizePmcid(record.pmcid || input.pmcid) || input.pmcid,
  };
}

/**
 * Fetches and normalizes NIH converter IDs for a single identifier.
 */
async function lookupNihById(
  id: string,
  cache: IdCache
): Promise<IdentifierSet> {
  const cacheKey = `nih:${id}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const url = `${NIH_CONVERTER_URL}?ids=${encodeURIComponent(id)}&format=json`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      cache.set(cacheKey, {});
      return {};
    }

    const data = (await response.json()) as NihConverterResponse;
    const record = data.records?.[0];
    const merged = mergeRecordIntoIds(record, {});
    cache.set(cacheKey, merged);
    return merged;
  } catch (error) {
    console.warn("NIH ID Converter lookup failed", error);
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Looks up PMID via PubMed E-utilities when NIH converter has no PubMed ID for a DOI.
 */
async function lookupPmidByDoi(
  doi: string,
  cache: IdCache
): Promise<string | undefined> {
  const cacheKey = `pubmed:${doi}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)?.pmid;
  }

  const params = new URLSearchParams({
    db: "pubmed",
    term: `${doi}[doi]`,
    retmode: "json",
    email: NIH_EMAIL,
    tool: NIH_TOOL,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${PUBMED_ESEARCH_URL}?${params.toString()}`, {
      signal: controller.signal,
    });

    if (!response.ok) return undefined;

    const data = (await response.json()) as {
      esearchresult?: { idlist?: string[] };
    };
    const pmid = normalizePmid(data.esearchresult?.idlist?.[0] ?? "");
    if (pmid) {
      cache.set(cacheKey, { pmid });
    }
    return pmid || undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Queries NIH PMC ID Converter and merges DOI, PMID, and PMCID.
 */
export async function enrichWithNihIds(
  input: IdentifierSet,
  cache: IdCache = new Map()
): Promise<IdentifierSet> {
  let enriched: IdentifierSet = { ...input };

  const candidateIds = [input.doi, input.pmid, input.pmcid].filter(Boolean) as string[];

  for (const id of candidateIds) {
    const found = await lookupNihById(id, cache);
    enriched = mergeNihIdentifiers(enriched, found);
  }

  if (enriched.doi && !enriched.pmid) {
    const pmid = await lookupPmidByDoi(enriched.doi, cache);
    if (pmid) {
      enriched = { ...enriched, pmid };
    }
  }

  // PMID → PMCID lookup when DOI lookup returned PMID but not PMCID.
  if (enriched.pmid && !enriched.pmcid) {
    const byPmid = await lookupNihById(enriched.pmid, cache);
    enriched = mergeNihIdentifiers(enriched, byPmid);
  }

  return enriched;
}

/**
 * NIH enrichment for Crossref Convert and local Convert.
 */
export async function enrichCrossrefIdentifiers(
  ref: ParsedReference,
  cache: IdCache
): Promise<EnrichedReference> {
  const ids = await enrichWithNihIds(
    { doi: ref.doi, pmid: ref.pmid, pmcid: ref.pmcid },
    cache
  );

  return {
    ...ref,
    doi: ids.doi,
    pmid: ids.pmid,
    pmcid: ids.pmcid,
    unresolved: !ids.doi && !ids.pmid && !ids.pmcid,
    warnings: [],
  };
}

/**
 * Adds PMID/PMCID/DOI from NIH for a single reference (fast local Convert).
 */
export async function enrichReferenceWithNih(
  ref: ParsedReference,
  cache: IdCache
): Promise<EnrichedReference> {
  return enrichCrossrefIdentifiers(ref, cache);
}

/**
 * Runs NIH enrichment with a concurrency limit of 3.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Enriches all references with NIH identifier lookups only (fast local Convert).
 */
export async function enrichReferencesLocal(
  references: ParsedReference[]
): Promise<EnrichedReference[]> {
  const cache: IdCache = new Map();
  return runWithConcurrency(references, CONCURRENCY_LIMIT, (ref) =>
    enrichReferenceWithNih(ref, cache)
  );
}

/** Creates a fresh NIH cache for a conversion batch. */
export function createNihCache(): IdCache {
  return new Map();
}
