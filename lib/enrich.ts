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
const PUBMED_ELINK_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi";
const NIH_EMAIL = "vahhab.p@gmail.com";
const NIH_TOOL = "crossref-reference-formatter";
const API_TIMEOUT_MS = 15_000;
const CONCURRENCY_LIMIT = 3;

/** In-memory cache scoped to one conversion request. */
export type IdCache = Map<string, { doi?: string; pmid?: string; pmcid?: string }>;

/** In-flight NIH requests to prevent concurrent cache overwrites. */
export type InFlightCache = Map<string, Promise<IdentifierSet>>;

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
    doi: original.doi ?? nih.doi,
    pmid: original.pmid ?? nih.pmid,
    pmcid: original.pmcid ?? nih.pmcid,
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

  const merged: IdentifierSet = {
    doi: normalizeDoi(record.doi || input.doi || "") || input.doi,
    pmid:
      normalizePmid(String(record.pmid ?? input.pmid ?? "")) || input.pmid,
    pmcid: normalizePmcid(record.pmcid ?? input.pmcid) || input.pmcid,
  };

  console.log("NIH raw record", record);
  console.log("Merged NIH IDs", {
    doi: merged.doi,
    pmid: merged.pmid,
    pmcid: merged.pmcid,
  });

  return merged;
}

/**
 * Returns true when `next` has at least as much identifier data as `current`.
 */
function isRicherOrEqual(current: IdentifierSet, next: IdentifierSet): boolean {
  const score = (ids: IdentifierSet) =>
    (ids.doi ? 1 : 0) + (ids.pmid ? 1 : 0) + (ids.pmcid ? 1 : 0);
  return score(next) >= score(current);
}

/**
 * Fetches and normalizes NIH converter IDs for a single identifier.
 */
async function lookupNihById(
  id: string,
  cache: IdCache,
  inFlight: InFlightCache
): Promise<IdentifierSet> {
  const cacheKey = `nih:${id}`;

  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  const pending = inFlight.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async (): Promise<IdentifierSet> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    try {
      const url = `${NIH_CONVERTER_URL}?ids=${encodeURIComponent(id)}&format=json`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        if (!cache.has(cacheKey)) {
          cache.set(cacheKey, {});
        }
        return cache.get(cacheKey)!;
      }

      const data = (await response.json()) as NihConverterResponse;
      const record = data.records?.[0];
      const merged = mergeRecordIntoIds(record, cache.get(cacheKey) ?? {});

      const existing = cache.get(cacheKey) ?? {};
      const best = isRicherOrEqual(existing, merged) ? merged : existing;
      cache.set(cacheKey, best);
      return best;
    } catch (error) {
      console.warn("NIH ID Converter lookup failed", error);
      if (!cache.has(cacheKey)) {
        cache.set(cacheKey, {});
      }
      return cache.get(cacheKey)!;
    } finally {
      clearTimeout(timeout);
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
}

/**
 * Looks up PMCID via PubMed elink (browser-safe; NIH ID Converter blocks CORS).
 */
async function lookupPmcidByPmid(
  pmid: string,
  cache: IdCache
): Promise<string | undefined> {
  const cacheKey = `elink-pmc:${pmid}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)?.pmcid;
  }

  const params = new URLSearchParams({
    dbfrom: "pubmed",
    db: "pmc",
    id: pmid,
    retmode: "json",
    email: NIH_EMAIL,
    tool: NIH_TOOL,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${PUBMED_ELINK_URL}?${params.toString()}`,
      { signal: controller.signal }
    );

    if (!response.ok) return undefined;

    const data = (await response.json()) as {
      linksets?: Array<{
        linksetdbs?: Array<{
          linkname?: string;
          links?: string[];
        }>;
      }>;
    };

    const pmcLink = data.linksets?.[0]?.linksetdbs?.find(
      (entry) => entry.linkname === "pubmed_pmc"
    );
    const pmcNumeric = pmcLink?.links?.[0];
    const pmcid = normalizePmcid(pmcNumeric ? `PMC${pmcNumeric}` : undefined);

    if (pmcid) {
      cache.set(cacheKey, { pmcid });
    }

    return pmcid || undefined;
  } catch (error) {
    console.warn("PubMed elink PMC lookup failed", error);
    return undefined;
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
  cache: IdCache = new Map(),
  inFlight: InFlightCache = new Map()
): Promise<IdentifierSet> {
  let enriched: IdentifierSet = { ...input };

  if (input.doi) {
    const byDoi = await lookupNihById(input.doi, cache, inFlight);
    enriched = mergeNihIdentifiers(enriched, byDoi);
  }

  if (enriched.pmid) {
    const byPmid = await lookupNihById(enriched.pmid, cache, inFlight);
    enriched = mergeNihIdentifiers(enriched, byPmid);
  }

  if (enriched.pmcid) {
    const byPmcid = await lookupNihById(enriched.pmcid, cache, inFlight);
    enriched = mergeNihIdentifiers(enriched, byPmcid);
  }

  if (enriched.doi && !enriched.pmid) {
    const pmid = await lookupPmidByDoi(enriched.doi, cache);
    if (pmid) {
      enriched = mergeNihIdentifiers(enriched, { pmid });
    }
  }

  if (enriched.pmid && !enriched.pmcid) {
    const pmcid = await lookupPmcidByPmid(enriched.pmid, cache);
    if (pmcid) {
      enriched = mergeNihIdentifiers(enriched, { pmcid });
    } else {
      const byPmid = await lookupNihById(enriched.pmid, cache, inFlight);
      enriched = mergeNihIdentifiers(enriched, byPmid);
    }
  }

  return enriched;
}

/**
 * NIH enrichment for Crossref Convert and local Convert.
 */
export async function enrichCrossrefIdentifiers(
  ref: ParsedReference,
  cache: IdCache,
  inFlight: InFlightCache
): Promise<EnrichedReference> {
  const ids = await enrichWithNihIds(
    { doi: ref.doi, pmid: ref.pmid, pmcid: ref.pmcid },
    cache,
    inFlight
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
  cache: IdCache,
  inFlight: InFlightCache
): Promise<EnrichedReference> {
  return enrichCrossrefIdentifiers(ref, cache, inFlight);
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

export interface NihEnrichmentContext {
  cache: IdCache;
  inFlight: InFlightCache;
}

/** Creates fresh NIH cache and in-flight maps for a conversion batch. */
export function createNihContext(): NihEnrichmentContext {
  return {
    cache: new Map(),
    inFlight: new Map(),
  };
}

/**
 * Enriches all references with NIH identifier lookups only (fast local Convert).
 */
export async function enrichReferencesLocal(
  references: ParsedReference[],
  context: NihEnrichmentContext = createNihContext()
): Promise<EnrichedReference[]> {
  return runWithConcurrency(references, CONCURRENCY_LIMIT, (ref) =>
    enrichReferenceWithNih(ref, context.cache, context.inFlight)
  );
}

/** @deprecated Use createNihContext */
export function createNihCache(): IdCache {
  return new Map();
}
