/**
 * Formats enriched references into Vancouver-style plain text and HTML output.
 */

import type {
  EnrichedReference,
  ParsedReference,
  ReferenceIdentifier,
  WarningEntry,
} from "@/types/reference";

/**
 * Returns the citation body used for display and export (original text, identifiers stripped).
 */
export function getDisplayCitationText(
  ref: ParsedReference | EnrichedReference
): string {
  return (
    ref.cleanedCitationTextWithoutIdentifierLines ||
    ref.citationText
  );
}

/**
 * Builds structured identifier link data for a reference.
 */
export function buildReferenceIdentifiers(
  ref: EnrichedReference
): ReferenceIdentifier[] {
  const identifiers: ReferenceIdentifier[] = [];

  if (ref.doi) {
    identifiers.push({
      kind: "doi",
      text: `[DOI:${ref.doi}]`,
      href: `https://doi.org/${ref.doi}`,
    });
  }
  if (ref.pmid) {
    identifiers.push({
      kind: "pmid",
      text: `[PMID:${ref.pmid}]`,
      href: `https://pubmed.ncbi.nlm.nih.gov/${ref.pmid}/`,
    });
  }
  if (ref.pmcid) {
    identifiers.push({
      kind: "pmcid",
      text: `[PMCID:${ref.pmcid}]`,
      href: `https://pmc.ncbi.nlm.nih.gov/articles/${ref.pmcid}/`,
    });
  }

  return identifiers;
}

/**
 * Builds the identifier suffix (DOI, PMID, PMCID) for plain text output.
 * Only includes identifiers that actually exist — no placeholders.
 */
function buildIdentifierSuffix(ref: EnrichedReference): string {
  const parts = buildReferenceIdentifiers(ref).map((item) => item.text);
  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/**
 * Formats a single reference as Vancouver-style plain text.
 */
export function formatReferencePlain(ref: EnrichedReference): string {
  const suffix = buildIdentifierSuffix(ref);
  return `${ref.number}. ${getDisplayCitationText(ref)}${suffix}`;
}

/**
 * Escapes HTML special characters for safe rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Builds clickable identifier links for HTML output.
 */
function buildIdentifierLinksHtml(ref: EnrichedReference): string {
  const parts = buildReferenceIdentifiers(ref).map(
    (item) =>
      `<a href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.text)}</a>`
  );

  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/**
 * Formats a single reference as HTML with clickable identifier links.
 */
export function formatReferenceHtml(ref: EnrichedReference): string {
  const links = buildIdentifierLinksHtml(ref);
  return `<p>${ref.number}. ${escapeHtml(getDisplayCitationText(ref))}${links}</p>`;
}

/**
 * Formats all references as plain text (one per line).
 */
export function formatAllPlain(references: EnrichedReference[]): string {
  return references.map(formatReferencePlain).join("\n\n");
}

/**
 * Formats all references as an HTML document fragment.
 */
export function formatAllHtml(references: EnrichedReference[]): string {
  const body = references.map(formatReferenceHtml).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>References</title>
  <style>
    body { font-family: Georgia, serif; font-size: 12pt; line-height: 1.6; max-width: 800px; margin: 2em auto; padding: 0 1em; }
    p { margin: 0 0 1em 0; text-align: justify; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Builds HTML for rich-text clipboard copy with clickable identifier links.
 * Includes a charset meta tag so Word and other targets interpret links correctly.
 */
export function formatRichTextClipHtml(references: EnrichedReference[]): string {
  const body = references.map(formatReferenceHtml).join("\n");
  return `<meta charset="utf-8">${body}`;
}

/**
 * Builds warning table entries for references with unresolved identifiers.
 */
export function buildWarnings(references: EnrichedReference[]): WarningEntry[] {
  return references
    .filter((ref) => ref.unresolved || ref.warnings.length > 0)
    .map((ref) => ({
      number: ref.number,
      citationPreview:
        getDisplayCitationText(ref).length > 120
          ? getDisplayCitationText(ref).slice(0, 120) + "…"
          : getDisplayCitationText(ref),
      warnings: ref.warnings,
    }));
}
