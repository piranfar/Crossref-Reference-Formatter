/**
 * Verification script for 8 test references (run: npx tsx scripts/verify-enrichment.ts)
 */
import { convertReferencesLocal } from "../lib/convert";
import { buildReferenceIdentifiers } from "../lib/format";

const TEST_INPUT = `1. Ref 1. doi:10.3390/antibiotics10121508
2. Ref 2. doi:10.1016/j.jhin.2020.11.028
3. Ref 3. doi:10.1128/AAC.00282-18
4. Ref 4. doi:10.1371/journal.pone.0251594
5. Ref 5. doi:10.3390/antibiotics12020234
6. Ref 6. doi:10.1186/s13643-022-02110-3
7. Ref 7. doi:10.1007/s40588-023-00211-8
8. Ref 8. doi:10.2147/IJGM.S214305`;

const EXPECTED = [
  {
    doi: "10.3390/antibiotics10121508",
    pmid: "34943720",
    pmcid: "PMC8698758",
  },
  { doi: "10.1016/j.jhin.2020.11.028", pmid: "33290814", pmcid: undefined },
  {
    doi: "10.1128/AAC.00282-18",
    pmid: "29712652",
    pmcid: "PMC5971569",
  },
  {
    doi: "10.1371/journal.pone.0251594",
    pmid: "34014957",
    pmcid: "PMC8136739",
  },
  {
    doi: "10.3390/antibiotics12020234",
    pmid: "36830145",
    pmcid: "PMC9952820",
  },
  {
    doi: "10.1186/s13643-022-02110-3",
    pmid: "36380387",
    pmcid: "PMC9667607",
  },
  { doi: "10.1007/s40588-023-00211-8", pmid: undefined, pmcid: undefined },
  {
    doi: "10.2147/IJGM.S214305",
    pmid: "31819594",
    pmcid: "PMC6886555",
  },
];

function doiMatches(actual?: string, expected?: string): boolean {
  if (!expected) return !actual;
  if (!actual) return false;
  return actual.toLowerCase() === expected.toLowerCase();
}

async function main() {
  const result = await convertReferencesLocal(TEST_INPUT);
  let ok = true;

  for (let i = 0; i < EXPECTED.length; i++) {
    const ref = result.references[i];
    const exp = EXPECTED[i];
    const rendered = buildReferenceIdentifiers(ref)
      .map((item) => item.text)
      .join(" ");

    const match =
      doiMatches(ref.doi, exp.doi) &&
      ref.pmid === exp.pmid &&
      ref.pmcid === exp.pmcid &&
      (!exp.pmcid || rendered.includes(`[PMCID:${exp.pmcid}]`)) &&
      (!exp.pmid || rendered.includes(`[PMID:${exp.pmid}]`));

    console.log(`#${ref.number}`, {
      doi: ref.doi,
      pmid: ref.pmid,
      pmcid: ref.pmcid,
      rendered,
      ok: match,
    });

    if (!match) ok = false;
  }

  if (!ok) process.exit(1);
  console.log("All enrichment checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
