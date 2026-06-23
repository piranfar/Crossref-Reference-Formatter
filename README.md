# Crossref Reference Formatter

A lightweight web app for cleaning journal reference lists by adding verified DOI, PMID, and PMCID identifiers to Vancouver-style references.

The app is designed for editors, reviewers, journal staff, and researchers who need to quickly convert references copied from Crossref Simple Text Query or manuscript reference lists into a clean, export-ready format.

## Purpose

Many manuscript reference lists are missing persistent identifiers or include DOI, PMID, and PMCID information in inconsistent formats. This tool helps standardize those identifiers without changing the original reference style.

The main principle is:

> Preserve the original reference text and append verified identifiers.

For example:

```text
1. Sotgiu G, Are B, Pesapane L, Palmieri A, Muresu N, Cossu A, et al. Nosocomial transmission of carbapenem-resistant Klebsiella pneumoniae in an Italian university hospital: a molecular epidemiological study. J Hosp Infect. 2018;99(4):413-8. [DOI:10.1016/j.jhin.2018.03.033] [PMID:29621600]
```

## Main Features

* Paste numbered references directly into the app
* Preserve the original Vancouver-style reference text
* Extract existing DOI, PMID, and PMCID values
* Search Crossref for missing DOI information
* Use NIH/NCBI PMC ID Converter to retrieve PMID and PMCID when available
* Append identifiers in clean bracketed format
* Keep DOI, PMID, and PMCID hyperlinks clickable in the preview and exports
* Copy formatted references as:

  * Plain text
  * Rich text with hyperlinks
  * HTML
* Download formatted references as:

  * `.docx`
  * `.html`
* Keep the original pasted references in a collapsed section
* Avoid showing technical warning tables to normal users

## Output Format

The app formats identifiers like this:

```text
[DOI:10.xxxx/yyyy] [PMID:12345678] [PMCID:PMC1234567]
```

Each identifier is hyperlinked in rich-text, HTML, and DOCX outputs:

* DOI links to `https://doi.org/{doi}`
* PMID links to `https://pubmed.ncbi.nlm.nih.gov/{pmid}/`
* PMCID links to `https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/`

If an identifier is not available, it is omitted. The app does not show empty placeholders such as `[PMID]` or `[PMCID]`.

## Reference Preservation

The app should not rewrite the reference body by default.

It should not:

* Change title capitalization
* Replace journal abbreviations with full journal names
* Reformat authors
* Rebuild the reference from Crossref metadata
* Change volume, issue, page, or article-number style

Crossref is used mainly to find or verify DOI values. NIH/NCBI is used to enrich DOI records with PMID and PMCID when possible.

## Data Flow

```text
Paste references
        ↓
Parse numbered references
        ↓
Remove raw DOI/PMID/PMCID lines if present
        ↓
Extract existing DOI, PMID, and PMCID
        ↓
Use Crossref to find or verify DOI
        ↓
Use NIH/NCBI PMC ID Converter to find PMID and PMCID
        ↓
Append verified identifiers to the original reference text
        ↓
Preview, copy, or export the final references
```

## Example Input

```text
1. Mohd Asri NA, Ahmad S, Mohamud R, Mohd Hanafi N, Mohd Zaidi NF, Irekeola AA, et al. Global prevalence of nosocomial multidrug-resistant Klebsiella pneumoniae: a systematic review and meta-analysis. Antibiotics. 2021;10(12):1508.
2. Luo K, Tang J, Qu Y, Yang X, Zhang L, Chen Z, et al. Nosocomial infection by Klebsiella pneumoniae among neonates: a molecular epidemiological study. J Hosp Infect. 2021;108:174-80.
```

## Example Output

```text
1. Mohd Asri NA, Ahmad S, Mohamud R, Mohd Hanafi N, Mohd Zaidi NF, Irekeola AA, et al. Global prevalence of nosocomial multidrug-resistant Klebsiella pneumoniae: a systematic review and meta-analysis. Antibiotics. 2021;10(12):1508. [DOI:10.3390/antibiotics10121508] [PMID:34943720] [PMCID:PMC8698758]
2. Luo K, Tang J, Qu Y, Yang X, Zhang L, Chen Z, et al. Nosocomial infection by Klebsiella pneumoniae among neonates: a molecular epidemiological study. J Hosp Infect. 2021;108:174-80. [DOI:10.1016/j.jhin.2020.11.028] [PMID:33290814]
```

## Buttons

### Convert

Performs local formatting using identifiers already present in the pasted references.

### Crossref Convert

Checks the references against Crossref to find or verify DOI values, then uses the NIH/NCBI PMC ID Converter to find PMID and PMCID when available.

### Copy Plain Text

Copies references as plain text. Hyperlinks are not preserved because plain text does not support clickable links.

### Copy Rich Text

Copies the formatted references with clickable hyperlinks. This is useful for pasting into Word, Google Docs, Gmail, and rich-text journal systems.

### Copy HTML

Copies the HTML source of the formatted references.

### Download .docx

Downloads the formatted references as a Microsoft Word document with clickable hyperlinks.

### Download .html

Downloads the formatted references as an HTML file.

## External Services

This app may use the following public services:

* Crossref REST API for DOI lookup and verification
* NIH/NCBI PMC ID Converter API for DOI, PMID, and PMCID mapping

The app does not invent missing identifiers. If DOI, PMID, or PMCID cannot be verified or retrieved, the missing identifier is omitted.

## Static Deployment

This project is designed to work as a static site and can be deployed on GitHub Pages.

Because GitHub Pages does not run backend server code, all conversion and API lookup logic should run in the browser.

The app should not depend on required Next.js API routes for the public GitHub Pages version.

## Project Map

```text
Crossref-Reference-Formatter/
│
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
│
├── components/
│   ├── Footer.tsx
│   ├── FormattedPreview.tsx
│   ├── ReferenceInput.tsx
│   └── WarningTable.tsx
│
├── lib/
│   ├── parser.ts
│   ├── enrich.ts
│   ├── format.ts
│   └── docxExport.ts
│
├── types/
│   └── reference.ts
│
├── public/
│
├── README.md
├── next.config.ts
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Recommended Tech Stack

* Next.js
* TypeScript
* React
* Tailwind CSS
* Crossref REST API
* NIH/NCBI PMC ID Converter API
* DOCX export support

## Installation

```bash
npm install
```

## Local Development

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Static Build Test

```bash
npm run build
npx serve out
```

If the app works from the `out` folder, it should work on GitHub Pages.

## GitHub Pages

The expected GitHub Pages URL format is:

```text
https://piranfar.github.io/Crossref-Reference-Formatter/
```

If the repository name changes, update the `basePath` and `assetPrefix` values in the Next.js configuration.

## Development Notes

The app is intended as an editorial utility. Accuracy and preservation of the original reference list are more important than aggressive automatic rewriting.

Recommended default behavior:

```text
Preserve reference text
+
Append verified identifiers
```

A future advanced option may allow users to rebuild references from Crossref metadata, but this should not be the default behavior.

## Copyright

© 2026 Vahhab Piranfar. All rights reserved.

Crossref Reference Formatter is an independent reference-cleaning and citation-formatting tool. It is not affiliated with Crossref, PubMed, PMC, NCBI, or NIH.
