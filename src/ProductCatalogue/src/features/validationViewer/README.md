# SevenCs validation report viewer (PC-UX-R10)

The shared, read-only viewer opens a native modal dialog from an existing `.vld` artifact's **View report** action. Main Map (including Package members), Dashboard, Analyze and Review keep their existing download links and report availability rules. ZIP diagnostics and other artifact formats remain download-only. The viewer does not initiate a validation, change workflow state, resolve a different Product, or claim an IC-ENC decision.

## Source and request contract

- Main Map uses the existing candidate revision's artifact link and the selected Product/member identity. The candidate link DTO does not expose the revision ID or artifact kind; do not invent either.
- Analyze and Review use the existing normalized artifact history and concrete member identity. Dashboard retains the existing report-history lookup and carries the selected artifact metadata through to the viewer. Activity-linked files can be previewed only when the same exact artifact identity and supported API route are verified.
- `domain/validationViewerArtifact.js` checks the VLD extension, supported kind when provided, exact artifact GUID, configured API base and Product owner. The backend remains the authority for actual access and file contents.
- `api/validationReportApi.js` uses the existing `GET electronicproducts/{name}/artifacts/{artifactId}` byte download. The read includes credentials and rejects redirects, non-200 responses and unexpected media types. A 16 MiB preview limit applies even to streamed responses without Content-Length. Existing downloads remain available for larger or unsupported files.
- The dialog module is imported only when a connected View report action is activated. One dialog session owns its request, abort signal and generation. Close, Escape, a backdrop click, pagehide, navigation or a superseding viewer retire it. A backdrop click requires the pointer press and click outside the dialog; selecting text or dragging from the report does not dismiss it. Late responses cannot publish. Native modal focus containment and explicit trigger/replacement focus restoration preserve the underlying workspace and report panel.

## Supported report format

The initial parser was verified against ten real Analyzer 5.5.0 Build 10 S-101 reports (including two files with invalid UTF-8 bytes). It uses native XML parsing, validates the `LogDocument` structure and group/header totals, and rejects DTD/entity declarations. An unsupported/malformed report falls back to decoded Raw file with an explanation instead of claiming no errors. No general S-57 or future Analyzer-format compatibility is claimed.

- Critical, Error and Warning totals come from the Analyzer summary/group titles. They are not counts of the stored `LogEntry` elements. The group count and available occurrence count are shown separately because Analyzer can store only a subset of findings.
- Findings initially show Critical + Error when failures exist; warning-only reports show all checks. Search uses check names, categories, messages, original references, and available object details. Filtered groups retain their full reported counts; a search cannot discover occurrences that Analyzer did not store.
- The selected check displays its actual occurrences one at a time. Primary and related objects preserve identifier strings, type, class and reported coordinates. Related objects are paged in groups of 25. No positions or feature identities are inferred. Message and suggested solution text comes from Analyzer, with only simple formatting tags removed. Report-derived strings are rendered as text, never HTML.
- The Raw file view displays the decoded text in a read-only textarea with case-sensitive find and native selection/copy. It is not a byte-for-byte replacement for the original download. Invalid UTF-8 receives replacement characters and an explicit warning. The existing download returns the original bytes.
- Report metadata includes original Analyzer parameters and dataset metadata. The header uses the selected artifact identity and available revision/stored date, while the parsed report identifies the actual validated dataset and validation start.

The implementation does not extract or map the shapes ZIP, translate validation meanings through AI, or integrate the Encoding Guide. Those are separate follow-ups.
