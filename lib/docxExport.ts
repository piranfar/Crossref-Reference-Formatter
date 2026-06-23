/**
 * Exports formatted references to a Word (.docx) document with hyperlinks.
 */

import {
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { EnrichedReference } from "@/types/reference";
import { buildReferenceIdentifiers, getDisplayCitationText } from "@/lib/format";

/**
 * Creates a hyperlink TextRun segment for Word export.
 */
function linkedRun(text: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [
      new TextRun({
        text,
        style: "Hyperlink",
        color: "0563C1",
        underline: {},
      }),
    ],
  });
}

/**
 * Builds paragraph children for a single reference with optional hyperlinks.
 */
function buildReferenceParagraph(ref: EnrichedReference): Paragraph {
  const children: (TextRun | ExternalHyperlink)[] = [
    new TextRun({ text: `${ref.number}. ${getDisplayCitationText(ref)}` }),
  ];

  for (const identifier of buildReferenceIdentifiers(ref)) {
    children.push(new TextRun({ text: " " }));
    children.push(linkedRun(identifier.text, identifier.href));
  }

  return new Paragraph({ children, spacing: { after: 200 } });
}

/**
 * Generates a .docx Blob from enriched references (client-side download).
 */
export async function exportToDocx(
  references: EnrichedReference[]
): Promise<Blob> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: references.map(buildReferenceParagraph),
      },
    ],
  });

  return Packer.toBlob(doc);
}
