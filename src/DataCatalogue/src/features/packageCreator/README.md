# Package Creator

The live `packages/create` route offers manual Package creation in the same
shell as Main Map and Package Assignment. Category, absolute Source URI and a
drawn AOI are required. The form groups Package details, Source, Description
and AOI. Optional inputs include Title, Source name, Source type and
Case / reference number. Use the latter for a WorkZone case number alongside
the required Source URI. The description can omit its language, use Danish
or English, or carry a user-entered code.
Description text is encoded at submission for existing HTML-capable readers.
The form leaves source timestamps, source-provided short IDs, charts,
display scale and detailed geometry to future slices.

Use Rectangle, Polygon and Circle in native Sketch at the bottom of the map.
Select individual areas to move, reshape or delete them. Native Undo/Redo
works within the active sketch operation. Escape cancels the operation.
Clear AOI removes all draft areas. Fit AOI fits every accepted area. The
shared basemap selector and saved-view preference retain the Creator map slot.

The [map adapter](../map/packageCreator/README.md) validates and dissolves
accepted draft areas into one XY WGS 84 Esri polygon. Separate areas remain
separate parts and overlapping areas merge. Draft graphics stay independent
for editing and the stored geometry remains authoritative after creation.

The [v1 contract](../../../docs/BACKEND_CONTRACTS.md#dc-creator-editor-02---manual-package-creation)
provides categories and the write. The Creator excludes only ENC, Landdata and
CoastAndRock, the exact archive-only IDs in API validation. The API decides
whether the selected category is active and has a valid prefix. WorkZone and
MarineAggregateExtraction can use explicit geometry. The server allocates
both identifiers and owns automatic Workstream binding. **Not prioritized**
omits Severity and uses the server default. **Highest priority** sends zero
and **Custom severity** sends the whole uint64 as an exact decimal integer token.

The result uses the 201 response for metadata and active Workstream IDs and
reads stored geometry by canonical ID. It shows the submitted Source URI
alongside the server's source projection. A preview failure leaves the create
confirmed and **Retry stored geometry** repeats only the geometry read.

Definite rejection keeps the form editable. Pending and unknown outcomes block
workflow departure and a new submission. Drawing is locked while pending,
unknown or confirmed. An incomplete 201 with one trusted identity can be
checked using the direct Package read. Conflicting receipt identities leave
the result unknown with no reconciliation ID. The draft stays in memory for review when evidence is
insufficient. **Abandon reconciliation** requires confirmation that the Package
may exist. An aborted or lost response may arrive after the server has written
geometry or committed the event. See the [gap register](../../../docs/DC_API_BACKEND_GAPS.md)
for operating limits and the delivered Review for acceptance steps.
