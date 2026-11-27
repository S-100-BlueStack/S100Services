# IC-ENC Report Viewer

The shared **View report** action opens the selected stored IC-ENC attachment as structured text.
Product History includes each eligible member's delivery reports. Analyze and Review use their
existing typed artifact lists. Dashboard uses its verified Product-scoped report fallback. Direct
Dashboard Activity download links without typed ownership evidence remain downloadable.

The caller passes the existing download and exact Product or member owner. The viewer checks both
owners, the artifact GUID and the API route before opening the dialog and again before requesting
bytes. The original Download remains available in every viewer state. Report text and conclusion are
document content. Product status and recorded delivery decisions come from their existing backend
projections.

## Content

The preview shows readable main-body paragraphs, run text, breaks, tables and supported floating
textboxes. It highlights recognized sections and summarizes unambiguous report metadata while
retaining the original body text and date strings. A supported AlternateContent Choice takes
precedence over its Fallback. When the Choice requires an unsupported namespace, the Fallback is
used if present. Text, including literal markup-like tokens and repeated diagnostics, is rendered
through text nodes.

The supported input is classic ZIP-based WordprocessingML with a UTF-8
`word/document.xml`, the matching Word document content type and an internal root Office Document
relationship. The viewer recognizes the format from the package, including when it is named
`.DOC`. Legacy DOC, other formats, ZIP64, encryption and invalid or oversized packages use the
original-download fallback. Some supported documents may contain material outside the preview scope.
Header, footer and page layout, image content, formatting, field instructions, embedded content
and other package parts are excluded. A readable main body with unsupported content or header/footer references shows a brief
limitation message. Report text never creates executable markup or outbound links.

## Limits and lifecycle

| Boundary          | Limit                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Decoded HTTP body | 16 MiB, enforced even without Content-Length                                                                                                                 |
| ZIP metadata      | 256 entries, 256 KiB central directory, 64 MiB total declared expansion, 256-byte ASCII entry names                                                          |
| Compression       | STORE or DEFLATE, up to the greater of 64 KiB or 300 times the declared compressed size per entry                                                            |
| Extracted parts   | 64 KiB each for content types and root relationships, 2 MiB for the main document, 2 MiB + 128 KiB total                                                     |
| XML and model     | 40,000 raw markup tokens and 40,000 DOM nodes plus attributes per part, depth 64 after native parsing, 650,000 text units and 6,000 report blocks/rows/cells |
| Session           | 20 seconds for import, request and asynchronous extraction, plus bounded synchronous XML/model work                                                          |

Zip.js inflates only the three selected parts. Each writable sink rejects output beyond the checked
size before retaining it and rejects short output. The session owns the import, request,
decompression, timeout and teardown. Escape, close, navigation and replacement retire the active
session. The underlying view keeps its normal focus rules.

## Verification

From `src/ProductCatalogue`, run `npm run test` for automated coverage of route/ownership, HTTP and
ZIP bounds, presentation, callers and modal session behavior. The two synthetic fixtures must be
included in a scoped source export used to run these tests.

With the pinned dependencies installed, run `npm run dev` and open
`/src/features/icEncReportViewer/tests/browser-check.html` under the development server's base path.
The page tests both fixtures with native XML parsing and zip.js, rejected packages and the native dialog.
Verify the actual stored reports and all entry points in the application as part of local acceptance.
