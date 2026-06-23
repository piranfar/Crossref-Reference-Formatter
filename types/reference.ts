/**
 * Shared types for reference parsing, enrichment, and formatting.
 */

/** A single parsed reference from user input before enrichment. */
export interface ParsedReference {
  /** Reference number from pasted input. */
  number: number;
  originalNumber: number;
  /** Full citation body as pasted (identifier lines included). */
  originalCitationText: string;
  /** Citation with raw DOI/PMID/PMCID lines and inline tokens removed. */
  cleanedCitationTextWithoutIdentifierLines: string;
  /** Alias for cleanedCitationTextWithoutIdentifierLines (display body). */
  citationText: string;
  doi?: string;
  pmid?: string;
  pmcid?: string;
}

/** Structured identifier link used across preview and export paths. */
export interface ReferenceIdentifier {
  kind: "doi" | "pmid" | "pmcid";
  text: string;
  href: string;
}

/** Enriched reference after external API lookups. */
export interface EnrichedReference extends ParsedReference {
  /** True when no DOI, PMID, or PMCID could be resolved. */
  unresolved: boolean;
  /** Human-readable warning messages for the warnings table. */
  warnings: string[];
}

/** Full conversion result from client-side conversion. */
export interface ConversionResult {
  references: EnrichedReference[];
  plainText: string;
  html: string;
  warnings: WarningEntry[];
  /** Set when external APIs are blocked (CORS/network) but formatting still succeeds. */
  globalWarning?: string;
}

/** Row in the unresolved / warnings table. */
export interface WarningEntry {
  number: number;
  citationPreview: string;
  warnings: string[];
}

/** NIH PMC ID Converter API record shape. */
export interface NihConverterRecord {
  doi?: string;
  pmid?: string | number;
  pmcid?: string;
  errcode?: string;
  status?: string;
}

/** NIH PMC ID Converter API response. */
export interface NihConverterResponse {
  status?: string;
  records?: NihConverterRecord[];
}

/** Crossref works API message item (search results). */
export interface CrossrefWork {
  DOI?: string;
  score?: number;
}

/** Crossref works API search response. */
export interface CrossrefWorksResponse {
  message?: {
    items?: CrossrefWork[];
  };
}

/** Crossref author object. */
export interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

/** Full Crossref work record from /works/{doi} or search. */
export interface CrossrefWorkDetail {
  DOI?: string;
  score?: number;
  title?: string[];
  author?: CrossrefAuthor[];
  "container-title"?: string[];
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  issued?: { "date-parts"?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  "article-number"?: string;
}

/** Crossref single-work API response. */
export interface CrossrefWorkResponse {
  message?: CrossrefWorkDetail;
}

/** Crossref bibliographic search API response. */
export interface CrossrefWorksSearchResponse {
  message?: {
    items?: CrossrefWorkDetail[];
  };
}

/** Options for Crossref DOI resolution. */
export interface CrossrefResolveOptions {
  /** When true, rebuild citation from Crossref metadata (default false). */
  normalizeFromCrossref?: boolean;
}

/** Progress callback for long-running Crossref conversion. */
export type CrossrefProgressCallback = (
  phase: "crossref" | "nih",
  current: number,
  total: number
) => void;
