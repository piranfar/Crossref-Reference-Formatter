/**
 * Parses Crossref Simple Text Query / deposited reference blocks into
 * structured reference objects with normalized identifiers.
 */

import type { ParsedReference } from "@/types/reference";

/** Regex to detect the start of a numbered reference (e.g. "1." or "12."). */
const REFERENCE_START = /^\s*(\d+)\.\s*/;

/** Patterns for extracting identifiers from reference text. */
const DOI_PATTERNS = [
  /https?:\/\/(?:dx\.)?doi\.org\/(\S+)/gi,
  /\bDOI:\s*(\S+)/gi,
  /\bdoi:\s*(\S+)/gi,
];

/** Case-insensitive patterns for Crossref Simple Text Query exports (PMid, PMCid). */
const PMID_PATTERN = /\bPM(?:ID|id):\s*(\d+)/gi;
const PMCID_PATTERN = /\bPMC(?:ID|id):\s*(PMC?\d+)/gi;

/** Lines that are purely identifier metadata and should be removed from citation body. */
const IDENTIFIER_LINE =
  /^\s*(?:https?:\/\/(?:dx\.)?doi\.org\/\S+|DOI:\s*\S+|doi:\s*\S+|PM(?:ID|id):\s*\d+|PMC(?:ID|id):\s*PMC?\d+)\s*$/i;

/**
 * Normalizes a DOI by stripping common URL prefixes and trailing punctuation.
 */
export function normalizeDoi(raw: string): string {
  let doi = raw.trim();
  doi = doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
  doi = doi.replace(/^doi:\s*/i, "");
  doi = doi.replace(/[.,;)\]]+$/, "");
  return doi.toLowerCase();
}

/**
 * Normalizes PMID to digits only.
 */
export function normalizePmid(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Normalizes PMCID to PMC + digits format.
 */
export function normalizePmcid(value?: string): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/^PMCID[:\s]*/i, "");
  const digits = cleaned.replace(/^PMC/i, "").replace(/[^\d]/g, "");
  return digits ? `PMC${digits}` : undefined;
}

/**
 * Extracts the first DOI found in text using multiple patterns.
 */
function extractDoi(text: string): string | undefined {
  for (const pattern of DOI_PATTERNS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match?.[1]) {
      return normalizeDoi(match[1]);
    }
  }
  return undefined;
}

/**
 * Extracts PMID from text (digits only).
 */
function extractPmid(text: string): string | undefined {
  PMID_PATTERN.lastIndex = 0;
  const match = PMID_PATTERN.exec(text);
  return match?.[1] ? normalizePmid(match[1]) : undefined;
}

/**
 * Extracts PMCID from text (PMC + digits).
 */
function extractPmcid(text: string): string | undefined {
  PMCID_PATTERN.lastIndex = 0;
  const match = PMCID_PATTERN.exec(text);
  if (!match?.[1]) return undefined;
  const raw = match[1].toUpperCase().startsWith("PMC")
    ? match[1]
    : `PMC${match[1]}`;
  return normalizePmcid(raw);
}

/**
 * Removes identifier-only lines and inline identifier tokens from citation body.
 */
function cleanCitationBody(lines: string[]): string {
  const filtered = lines
    .filter((line) => !IDENTIFIER_LINE.test(line.trim()))
    .map((line) => {
      let cleaned = line;
      for (const pattern of DOI_PATTERNS) {
        pattern.lastIndex = 0;
        cleaned = cleaned.replace(pattern, "");
      }
      PMID_PATTERN.lastIndex = 0;
      cleaned = cleaned.replace(PMID_PATTERN, "");
      PMCID_PATTERN.lastIndex = 0;
      cleaned = cleaned.replace(PMCID_PATTERN, "");
      return cleaned.trim();
    })
    .filter(Boolean);

  return filtered.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Splits raw input into individual reference blocks by lines starting with "N.".
 */
function splitReferenceBlocks(input: string): { number: number; block: string }[] {
  const normalized = input.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks: { number: number; block: string }[] = [];
  let currentNumber: number | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const startMatch = line.match(REFERENCE_START);
    if (startMatch) {
      if (currentNumber !== null) {
        blocks.push({ number: currentNumber, block: currentLines.join("\n") });
      }
      currentNumber = parseInt(startMatch[1], 10);
      currentLines = [line.replace(REFERENCE_START, "")];
    } else if (currentNumber !== null) {
      currentLines.push(line);
    }
  }

  if (currentNumber !== null) {
    blocks.push({ number: currentNumber, block: currentLines.join("\n") });
  }

  return blocks;
}

/**
 * Parses a single reference block into a ParsedReference.
 */
function parseBlock(number: number, block: string): ParsedReference {
  const lines = block.split("\n");
  const fullText = block;

  const doi = extractDoi(fullText);
  const pmid = extractPmid(fullText);
  const pmcid = extractPmcid(fullText);

  const originalCitationText = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  const cleanedCitationTextWithoutIdentifierLines = cleanCitationBody(lines);

  return {
    number,
    originalNumber: number,
    originalCitationText,
    cleanedCitationTextWithoutIdentifierLines,
    citationText: cleanedCitationTextWithoutIdentifierLines,
    doi,
    pmid,
    pmcid,
  };
}

/**
 * Main entry: parses pasted Crossref reference text into an ordered array.
 * Throws if input is empty or no numbered references are detected.
 */
export function parseReferences(input: string): ParsedReference[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Input is empty. Paste at least one numbered reference.");
  }

  const blocks = splitReferenceBlocks(trimmed);
  if (blocks.length === 0) {
    throw new Error(
      "No numbered references found. Each reference must start with a number and period (e.g. '1.')."
    );
  }

  return blocks.map(({ number, block }) => parseBlock(number, block));
}
