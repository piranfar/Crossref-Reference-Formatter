/**
 * Crossref REST API client and Vancouver-style citation builder.
 * Runs entirely in the browser for static GitHub Pages deployment.
 */

import type {
  CrossrefAuthor,
  CrossrefResolveOptions,
  CrossrefWorkDetail,
  CrossrefWorkResponse,
  CrossrefWorksSearchResponse,
} from "@/types/reference";

const CROSSREF_WORKS_URL = "https://api.crossref.org/works";
const CROSSREF_MAILTO = "vahhab.p@gmail.com";
const API_TIMEOUT_MS = 15_000;
const BIBLIOGRAPHIC_MIN_SCORE = 60;
const TITLE_SIMILARITY_THRESHOLD = 0.45;
const REQUEST_DELAY_MS = 150;

/** In-memory cache for Crossref responses within one conversion batch. */
export type CrossrefCache = Map<string, CrossrefWorkDetail | null | "pending">;

let lastRequestTime = 0;

/**
 * Waits between Crossref requests to respect polite pool usage.
 */
async function rateLimitDelay(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  const wait = Math.max(0, REQUEST_DELAY_MS - elapsed);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestTime = Date.now();
}

/**
 * Fetches JSON from Crossref with timeout and browser-safe error handling.
 */
async function fetchCrossrefJson<T>(
  url: string
): Promise<{ data: T | null; failed: boolean }> {
  await rateLimitDelay();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { data: null, failed: true };
    }

    return { data: (await response.json()) as T, failed: false };
  } catch {
    return { data: null, failed: true };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Builds a Crossref API URL with the polite pool mailto parameter.
 */
function crossrefUrl(path: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams({ ...params, mailto: CROSSREF_MAILTO });
  return `${CROSSREF_WORKS_URL}${path}?${search.toString()}`;
}

/**
 * Returns true when a Crossref work record contains usable bibliographic fields.
 */
export function isValidCrossrefWork(work: CrossrefWorkDetail): boolean {
  return Boolean(
    work.title?.[0] || work["container-title"]?.[0] || work.author?.length
  );
}

/**
 * Normalizes a title string for similarity comparison.
 */
function normalizeTitle(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

/**
 * Computes Jaccard word overlap between two title strings (0–1).
 */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a));
  const wordsB = new Set(normalizeTitle(b));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

/**
 * Extracts the author segment from a pasted citation (text before the first period).
 */
function extractAuthorsFromCitation(citation: string): string {
  const match = citation.match(/^(.+?)\.\s+/);
  return match?.[1]?.trim() ?? citation;
}

/**
 * Formats a single Crossref author as "Lastname Initials".
 */
function formatAuthorName(author: CrossrefAuthor): string {
  if (author.name) return author.name;

  const family = author.family?.trim() ?? "";
  const given = author.given?.trim() ?? "";

  if (!family && !given) return "";

  const initials = given
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return family ? `${family} ${initials}`.trim() : given;
}

/**
 * Formats author list in Vancouver style; uses pasted authors when Crossref has none.
 */
export function formatAuthors(
  authors: CrossrefAuthor[] | undefined,
  fallbackCitation: string
): string {
  const formatted =
    authors?.map(formatAuthorName).filter(Boolean) ?? [];

  if (formatted.length === 0) {
    return extractAuthorsFromCitation(fallbackCitation);
  }

  if (formatted.length > 6) {
    return `${formatted.slice(0, 6).join(", ")}, et al.`;
  }

  return formatted.join(", ");
}

/**
 * Extracts publication year from Crossref date fields.
 */
function getPublicationYear(work: CrossrefWorkDetail): string | undefined {
  const sources = [
    work["published-print"],
    work["published-online"],
    work.published,
    work.issued,
  ];

  for (const source of sources) {
    const year = source?.["date-parts"]?.[0]?.[0];
    if (year) return String(year);
  }

  return undefined;
}

/**
 * Extracts page or article-number from Crossref work metadata.
 */
function getPages(work: CrossrefWorkDetail): string | undefined {
  if (work.page) {
    return work.page.replace(/--/g, "-");
  }
  if (work["article-number"]) {
    return work["article-number"];
  }
  return undefined;
}

/**
 * Builds a Vancouver-style citation string from Crossref metadata.
 */
export function formatVancouverFromCrossref(
  work: CrossrefWorkDetail,
  originalCitation: string
): string {
  const authors = formatAuthors(work.author, originalCitation);
  const title = (work.title?.[0] ?? "").replace(/\.$/, "").trim();
  const journal = (work["container-title"]?.[0] ?? "").trim();
  const year = getPublicationYear(work);
  const volume = work.volume?.trim() ?? "";
  const issue = work.issue?.trim() ?? "";
  const pages = getPages(work);

  let segment = `${authors}. ${title}. ${journal}.`;

  if (year) {
    segment += ` ${year}`;
    if (volume) {
      segment += `;${volume}`;
      if (issue) segment += `(${issue})`;
      if (pages) segment += `:${pages}`;
    }
    segment += ".";
  }

  return segment.replace(/\s+/g, " ").replace(/\.+/g, ".").trim();
}

/**
 * Determines whether a Crossref match should be accepted for bibliographic search.
 */
export function isHighConfidenceMatch(
  pastedCitation: string,
  work: CrossrefWorkDetail,
  score: number,
  hadDoi: boolean
): boolean {
  if (hadDoi && isValidCrossrefWork(work)) {
    return true;
  }

  if (score >= BIBLIOGRAPHIC_MIN_SCORE) {
    return true;
  }

  const crossrefTitle = work.title?.[0] ?? "";
  if (
    crossrefTitle &&
    titleSimilarity(pastedCitation, crossrefTitle) >=
      TITLE_SIMILARITY_THRESHOLD
  ) {
    return true;
  }

  return false;
}

/**
 * Fetches a single work record by DOI from Crossref.
 */
export async function fetchCrossrefWorkByDoi(
  doi: string,
  cache: CrossrefCache
): Promise<{ work: CrossrefWorkDetail | null; failed: boolean }> {
  const cacheKey = `doi:${doi.toLowerCase()}`;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    return {
      work: cached && cached !== "pending" ? cached : null,
      failed: false,
    };
  }

  const url = crossrefUrl(`/${encodeURIComponent(doi)}`);
  const { data, failed } = await fetchCrossrefJson<CrossrefWorkResponse>(url);

  const work = data?.message && isValidCrossrefWork(data.message)
    ? data.message
    : null;

  cache.set(cacheKey, work);
  return { work, failed };
}

/**
 * Searches Crossref by bibliographic string and returns the best match.
 */
export async function searchCrossrefBibliographic(
  citation: string,
  cache: CrossrefCache
): Promise<{
  work: CrossrefWorkDetail | null;
  score: number;
  failed: boolean;
}> {
  const cacheKey = `bib:${citation.slice(0, 200)}`;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (cached && cached !== "pending") {
      return { work: cached, score: cached.score ?? 0, failed: false };
    }
    return { work: null, score: 0, failed: false };
  }

  const url = crossrefUrl("", {
    "query.bibliographic": citation,
    rows: "1",
  });

  const { data, failed } =
    await fetchCrossrefJson<CrossrefWorksSearchResponse>(url);

  const item = data?.message?.items?.[0] ?? null;
  const work =
    item && isValidCrossrefWork(item) ? item : null;

  cache.set(cacheKey, work);
  return { work, score: work?.score ?? 0, failed };
}

/**
 * Resolves or verifies DOI via Crossref without rewriting the citation body.
 * Crossref metadata is used for matching confidence only unless normalizeFromCrossref is true.
 */
export async function resolveCrossrefDoi(
  cleanedCitationText: string,
  doi: string | undefined,
  cache: CrossrefCache,
  options: CrossrefResolveOptions = {}
): Promise<{
  doi?: string;
  citationText: string;
  failed: boolean;
  crossrefMatched: boolean;
}> {
  const { normalizeFromCrossref = false } = options;
  const displayText = cleanedCitationText;
  const hadDoi = Boolean(doi);
  let work: CrossrefWorkDetail | null = null;
  let score = 0;
  let failed = false;

  if (doi) {
    const result = await fetchCrossrefWorkByDoi(doi, cache);
    work = result.work;
    failed = result.failed;
    score = work?.score ?? 100;
  } else {
    const result = await searchCrossrefBibliographic(cleanedCitationText, cache);
    work = result.work;
    score = result.score;
    failed = result.failed;
  }

  if (failed) {
    return { doi, citationText: displayText, failed: true, crossrefMatched: false };
  }

  const matched =
    work !== null &&
    isHighConfidenceMatch(cleanedCitationText, work, score, hadDoi);

  if (!matched) {
    return { doi, citationText: displayText, failed: false, crossrefMatched: false };
  }

  const resolvedDoi = work!.DOI?.toLowerCase() ?? doi;

  if (normalizeFromCrossref && work) {
    return {
      doi: resolvedDoi,
      citationText: formatVancouverFromCrossref(work, cleanedCitationText),
      failed: false,
      crossrefMatched: true,
    };
  }

  return {
    doi: resolvedDoi,
    citationText: displayText,
    failed: false,
    crossrefMatched: true,
  };
}

/** @deprecated Use resolveCrossrefDoi — preserves original citation text by default. */
export async function resolveCrossrefCitation(
  citationText: string,
  doi: string | undefined,
  cache: CrossrefCache
): Promise<{
  citationText: string;
  doi?: string;
  crossrefUsed: boolean;
  failed: boolean;
}> {
  const result = await resolveCrossrefDoi(citationText, doi, cache);
  return {
    citationText: result.citationText,
    doi: result.doi,
    crossrefUsed: result.crossrefMatched,
    failed: result.failed,
  };
}
