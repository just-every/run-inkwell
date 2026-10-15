# Synthetic completed-submission archive

`completed-submission.json` follows DocuSeal's documented GET `/submissions/{id}`
response: https://www.docuseal.com/docs/api (checked 15 October 2026).

`archive.json` wraps it in Inkwell's explicit local upload envelope and includes
the PDF bytes. `signed.pdf` and `audit.pdf` were generated with `textPdf` from
`scratch/gr-inkwell-1/locket/src/locket/pdf.ts`. Both are valid, synthetic test
documents. They do not represent real agreements, signatures, certificates or
identity checks. All names, addresses, URLs and events are fixture data.

The source response's URLs link the supplied files; Inkwell never requests them.
