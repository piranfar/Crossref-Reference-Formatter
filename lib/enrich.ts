/**
 * Enriches parsed references via NIH PMC ID Converter and PubMed E-utilities.
 */

import {
  canonicalDoi,
  cleanDoi,
  extractTitleFromCitation,
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
const PUBMED_ESUMMARY_URL =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const NIH_EMAIL = "vahhab.p@gmail.com";
const NIH_TOOL = "crossref-reference-formatter";
const API_TIMEOUT_MS = 15_000;
const CONCURRENCY_LIMIT = 1;
const EUTILS_DELAY_MS = 350;

/** In-memory cache scoped to one conversion request. */
export type IdCache = Map<string, { doi?: string; pmid?: string; pmcid?: string }>;

/** In-flight NIH requests to prevent concurrent cache overwrites. */
export type InFlightCache = Map<string, Promise<IdentifierSet>>;

export interface IdentifierSet {
  doi?: string;
  pmid?: string;
  pmcid?: string;
}

export interface EnrichmentOptions {
  title?: string;
}

let lastEutilsRequestTime = 0;
let eutilsChain: Promise<unknown> = Promise.resolve();

async function eutilsDelay(): Promise<void> {
  const elapsed = Date.now() - lastEutilsRequestTime;
  const wait = Math.max(0, EUTILS_DELAY_MS - elapsed);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastEutilsRequestTime = Date.now();
}

/** Serializes PubMed E-utilities requests to respect NCBI rate limits. */
async function withEutils<T>(fn: () => Promise<T>): Promise<T> {
  const task = eutilsChain.then(async () => {
    await eutilsDelay();
    return fn();
  });
  eutilsChain = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

/**
 * Merges identifier sets without overwriting existing values with undefined.
 */
export function mergeIdentifiers(
  current: IdentifierSet,
  incoming: IdentifierSet
): IdentifierSet {
  const mergedDoi = current.doi ?? (incoming.doi ? cleanDoi(incoming.doi) : undefined);
  const mergedPmid =
    current.pmid ??
    (incoming.pmid ? normalizePmid(String(incoming.pmid)) : undefined);
  const mergedPmcid =
    current.pmcid ?? normalizePmcid(incoming.pmcid ?? undefined);

  return {
    doi: mergedDoi || undefined,
    pmid: mergedPmid || undefined,
    pmcid: mergedPmcid,
  };
}

/** @deprecated Use mergeIdentifiers */
export function mergeNihIdentifiers(
  original: IdentifierSet,
  nih: IdentifierSet
): IdentifierSet {
  return mergeIdentifiers(original, nih);
}

/**
 * Converts a NIH converter record into an identifier set (skips error records).
 */
function recordToIds(record: NihConverterRecord | undefined): IdentifierSet {
  if (!record || record.status === "error" || record.errcode) {
    return {};
  }

  return {
    doi: record.doi ? cleanDoi(record.doi) : undefined,
    pmid: record.pmid ? normalizePmid(String(record.pmid)) : undefined,
    pmcid: normalizePmcid(record.pmcid),
  };
}

/**
 * Builds DOI lookup candidates: original, lowercased, and uppercased publisher path.
 */
function buildDoiLookupCandidates(doi: string): string[] {
  const candidates: string[] = [doi];

  const lower = doi.toLowerCase();
  if (lower !== doi) {
    candidates.push(lower);
  }

  const slashIndex = doi.indexOf("/");
  if (slashIndex !== -1) {
    const prefix = doi.slice(0, slashIndex + 1);
    const suffix = doi.slice(slashIndex + 1);
    const upperSuffix = suffix.replace(/^([^/.]+)/, (segment) =>
      segment.toUpperCase()
    );
    const upperVariant = prefix + upperSuffix;
    if (!candidates.includes(upperVariant)) {
      candidates.push(upperVariant);
    }
  }

  return [...new Set(candidates)];
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
        cache.set(cacheKey, {});
        return {};
      }

      const data = (await response.json()) as NihConverterResponse;
      const ids = recordToIds(data.records?.[0]);

      if (process.env.NODE_ENV === "development" && data.records?.[0]) {
        console.log("NIH raw record", data.records[0]);
      }

      const existing = cache.get(cacheKey) ?? {};
      const merged = mergeIdentifiers(existing, ids);
      cache.set(cacheKey, merged);

      if (process.env.NODE_ENV === "development") {
        console.log("Merged NIH IDs", merged);
      }

      return merged;
    } catch (error) {
      console.warn("NIH ID Converter lookup failed", error);
      cache.set(cacheKey, {});
      return {};
    } finally {
      clearTimeout(timeout);
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, request);
  return request;
}

/**
 * Looks up PMCID via PubMed elink (browser-safe when NIH ID Converter is CORS-blocked).
 */
async function lookupPmcidByPmid(
  pmid: string,
  cache: IdCache
): Promise<string | undefined> {
  const cacheKey = `elink-pmc:${pmid}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)?.pmcid;
  }

  return withEutils(async () => {
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
  });
}

/**
 * Runs PubMed esearch with a DOI field suffix ([doi] or [AID]).
 */
async function esearchPubmedByDoiTerm(
  doi: string,
  field: "[doi]" | "[AID]",
  cache: IdCache
): Promise<string | undefined> {
  const cacheKey = `pubmed:${field}:${canonicalDoi(doi)}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)?.pmid;
  }

  return withEutils(async () => {
    const params = new URLSearchParams({
      db: "pubmed",
      term: `${doi}${field}`,
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
  });
}

/**
 * Looks up PMID via PubMed esearch using DOI variants and [doi]/[AID] fields.
 */
async function lookupPmidByDoi(
  doi: string,
  cache: IdCache
): Promise<string | undefined> {
  for (const candidate of buildDoiLookupCandidates(doi)) {
    const byDoi = await esearchPubmedByDoiTerm(candidate, "[doi]", cache);
    if (byDoi) return byDoi;

    const byAid = await esearchPubmedByDoiTerm(candidate, "[AID]", cache);
    if (byAid) return byAid;
  }

  return undefined;
}

/**
 * Normalizes a title for comparison (lowercase, strip punctuation).
 */
function normalizeTitleForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/**
 * Computes Jaccard word overlap between two titles (0–1).
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitleForMatch(a));
  const wordsB = new Set(normalizeTitleForMatch(b));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Looks up PMID via PubMed esearch by title when DOI lookup fails.
 */
async function lookupPmidByTitle(
  title: string,
  cache: IdCache
): Promise<string | undefined> {
  const cacheKey = `pubmed-title:${title.slice(0, 120).toLowerCase()}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)?.pmid;
  }

  return withEutils(async () => {
    const params = new URLSearchParams({
      db: "pubmed",
      term: title,
      retmode: "json",
      retmax: "5",
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
        esearchresult?: { count?: string; idlist?: string[] };
      };
      const count = parseInt(data.esearchresult?.count ?? "0", 10);
      const idlist = data.esearchresult?.idlist ?? [];

      if (count === 1 && idlist[0]) {
        const pmid = normalizePmid(idlist[0]);
        cache.set(cacheKey, { pmid });
        return pmid;
      }

      if (idlist.length === 0) return undefined;

      await eutilsDelay();
      const summaryParams = new URLSearchParams({
        db: "pubmed",
        id: idlist.join(","),
        retmode: "json",
        email: NIH_EMAIL,
        tool: NIH_TOOL,
      });

      const summaryResponse = await fetch(
        `${PUBMED_ESUMMARY_URL}?${summaryParams.toString()}`,
        { signal: controller.signal }
      );

      if (!summaryResponse.ok) return undefined;

      const summaryData = (await summaryResponse.json()) as {
        result?: Record<
          string,
          { uid?: string; title?: string } | string | undefined
        >;
      };

      let bestPmid: string | undefined;
      let bestScore = 0;

      for (const uid of idlist) {
        const entry = summaryData.result?.[uid];
        if (!entry || typeof entry === "string") continue;
        const resultTitle = entry.title ?? "";
        const score = titleSimilarity(title, resultTitle);
        if (score > bestScore) {
          bestScore = score;
          bestPmid = normalizePmid(entry.uid ?? uid);
        }
      }

      if (bestPmid && bestScore >= 0.6) {
        cache.set(cacheKey, { pmid: bestPmid });
        return bestPmid;
      }

      return undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  });
}

/**
 * Runs NIH lookup for one ID and merges into the accumulator.
 */
async function applyNihLookup(
  id: string,
  merged: IdentifierSet,
  cache: IdCache,
  inFlight: InFlightCache
): Promise<IdentifierSet> {
  const result = await lookupNihById(id, cache, inFlight);
  return mergeIdentifiers(merged, result);
}

/**
 * Resolves PMCID from PMID using elink then NIH as fallback.
 */
async function resolvePmcidFromPmid(
  pmid: string,
  merged: IdentifierSet,
  cache: IdCache,
  inFlight: InFlightCache
): Promise<IdentifierSet> {
  if (merged.pmcid) return merged;

  const pmcid = await lookupPmcidByPmid(pmid, cache);
  if (pmcid) {
    return mergeIdentifiers(merged, { pmcid });
  }

  return applyNihLookup(pmid, merged, cache, inFlight);
}

/**
 * Queries NIH PMC ID Converter and PubMed fallbacks; merges all successful results.
 */
export async function enrichWithNihIds(
  input: IdentifierSet,
  cache: IdCache = new Map(),
  inFlight: InFlightCache = new Map(),
  options: EnrichmentOptions = {}
): Promise<IdentifierSet> {
  const displayDoi = input.doi;
  let merged: IdentifierSet = { ...input };
  const tried = new Set<string>();

  async function tryNih(id: string): Promise<void> {
    if (!id || tried.has(id)) return;
    tried.add(id);
    merged = await applyNihLookup(id, merged, cache, inFlight);

    if (merged.pmid && !tried.has(merged.pmid)) {
      await tryNih(merged.pmid);
    }
  }

  if (input.doi) {
    for (const doiCandidate of buildDoiLookupCandidates(input.doi)) {
      await tryNih(doiCandidate);
    }
  }

  if (input.pmid) {
    await tryNih(input.pmid);
  }

  if (input.pmcid) {
    await tryNih(input.pmcid);
  }

  if (displayDoi && !merged.pmid) {
    const pmid = await lookupPmidByDoi(displayDoi, cache);
    if (pmid) {
      merged = mergeIdentifiers(merged, { pmid });
      await tryNih(pmid);
    }
  }

  if (!merged.pmid && options.title) {
    const pmid = await lookupPmidByTitle(options.title, cache);
    if (pmid) {
      merged = mergeIdentifiers(merged, { pmid });
      await tryNih(pmid);
    }
  }

  if (merged.pmid && !merged.pmcid) {
    merged = await resolvePmcidFromPmid(merged.pmid, merged, cache, inFlight);
  }

  if (merged.pmcid) {
    await tryNih(merged.pmcid);
  }

  if (displayDoi) {
    merged.doi = displayDoi;
  }

  return merged;
}

/**
 * NIH enrichment for Crossref Convert and local Convert.
 */
export async function enrichCrossrefIdentifiers(
  ref: ParsedReference,
  cache: IdCache,
  inFlight: InFlightCache
): Promise<EnrichedReference> {
  const title = extractTitleFromCitation(
    ref.cleanedCitationTextWithoutIdentifierLines
  );

  const ids = await enrichWithNihIds(
    { doi: ref.doi, pmid: ref.pmid, pmcid: ref.pmcid },
    cache,
    inFlight,
    { title }
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
