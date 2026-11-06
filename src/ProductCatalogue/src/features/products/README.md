# Products

Shared Product helpers serve Main map, Analyze, Review and Dashboard.
The [normalized workflow review](../../../docs/normalized-workflow-frontend-adaptation.md)
is historical integration evidence. Current source-aware work-unit ownership is
summarized here and in the owning Analyze, Review, History and popup README files.

## Catalog and identity

The shared Product picker uses the lightweight `GET electronicproducts` name list only for dataset-name
selection. `workspaceProductService` resolves an opened Analyze/Review Product with the targeted
`GET electronicproducts/{datasetName}/aoi` contract, whose response supplies authoritative
`ProductSpecification` and source-owned geometry. Main-map package AOI loading
uses `GET electronicproducts/aoi?layer=ENC` for one representative package Graphic;
S-57 is resolved through targeted workspace reads and does not use a separate
selectable Main-map bulk source.

Each resolved Product retains sourceId, productKey, datasetName and registry capabilities/content
configuration. The frontend never derives source from dataset-name patterns. Globally unique datasetName
remains the public route identity; a backend identity conflict or malformed targeted response fails closed
instead of falling back to a bulk source catalog. Workspace availability respects deployment
configuration but is independent of Main-map source toggles.

## Workspace work-unit resolution (F6A)

`workspaceProductService.resolveProduct(datasetName)` remains the exact Product API:
S-101 resolves to S-101 and S-57 resolves to S-57. Registry workspace ProductContext now retains
an application-owned, deeply copied and frozen `workUnit` declaration. Its navigation restrictions
are not overlaid onto direct workspace capabilities; the Main-map overlay remains unchanged.

`createWorkspaceWorkUnitService({ registry, productService, fetchProduct }).resolveWorkUnit(name, options)`
is the separate opt-in canonical work-unit boundary. When injecting dependencies, the exact Product
service must use the same registry. Resolution options are forwarded to the exact API.
Analyze (F6B), Review (F6C) and floating History (F6D) use the canonical work-unit
boundary when loading a package; the exact Product resolver retains its independent
single-Product semantics.

The package owner declares ordered members with explicit `sourceId` references. The secondary
source also declares `workspace.workUnitSourceId`, so removing the owner cannot silently turn a
package member into an ordinary Product. An explicit owner reference requires a workspace-available
package owner that claims the requested source exactly once; it excludes ordinary Product fallback.
Every declared member's present owner reference must point to the selected owner, regardless of which
member was requested. Absent references remain allowed for members claimed by the owner declaration.
The resolver uses
`fetchProductPropertiesByDatasetName` and its normalized `workUnitMetadata.members` to obtain concrete
identities. It never derives member names or source membership from dataset naming patterns.
Both members are validated through exact targeted AOI resolution. The primary member is canonical;
a mapped secondary entry must also agree with the primary Product detail's current mapping.
The work-unit identity serializes package kind, primary source and case-normalized canonical dataset
name, following existing workspace dataset comparison semantics.

Resolved results retain the canonical exact Product result and add `requestedDatasetName` and an
immutable `workUnit` containing `kind`, `identityKey`, `primaryMemberKey` and ordered concrete members
(`key`, `label`, `exportStandard`, `sourceId`, `datasetName`). Simple/compatibility Products retain
exact resolution with `workUnit: null`. Failures publish no Product or partial package work unit;
provider errors remain available alongside the package contract error.

Package resolution fails closed for incomplete/duplicate member identities, missing or unavailable
sources, ambiguous declarations, wrong source/specification/type, stale context declarations,
registry replacement during reads, detail failure/identity mismatch, exact member failure or
contradictory primary/secondary mappings. Exact and detail reads are deduplicated only within one
request. There is no polling, persistent package cache, refresh listener or additional lifecycle owner.
The caller remains responsible for suppressing superseded requests. Independent backend reads are
not a transactional snapshot; future workspace lifecycle slices must own freshness/publication.

Analyze (F6B), Review (F6C) and floating History (F6D) present a package as one
canonical S-101 work unit with ordered exact S-101/S-57 member contexts. Mapped
secondary names canonicalize to the primary dataset in existing `Datasets=` routes;
Collection retains one package item and existing Analyze/Review permission checks.
Analyze may reuse resolved ordered `memberProducts` and request-scoped `productDetails`
without changing `resolveProduct()` semantics. A bad owner reference, conflicting
member name/specification or noncurrent registry/session must fail closed, not fall
back to a simple Product.

Package Tools can navigate to Analyze, Review and History. Workflow mutations are
**not** granted by work-unit resolution: current Pause/Resume/Discard availability
requires an independent, authoritative package action session; Send/Accept has no
production dispatch. Ordinary Product mutations remain disabled in FI-029 without
an explicit source-owned backend contract. Preserve this distinction when adding
future sources or demonstrating workflow actions. Historical F6 discovery and
candidate reports remain recoverable through Git history.

## Jobs and mutations

```text
POST /export/{datasetName}/newedition
POST /export/{datasetName}/newupdate
POST /export/{datasetName}/cancel-export
GET /jobs/{jobId}
GET /jobs/active?datasetName={datasetName}
```

The backend resolves specification from the exact Product; no exportTarget query is sent.
Frontend operation identities are ExportEdition, ExportUpdate and CancelExport. The current backend
wire contract returns `NewDataset` for both Edition and Update jobs. A `NewDataset` response is therefore
accepted only when frontend request context already identifies the job as ExportEdition or ExportUpdate;
the canonical request identity is retained for persistence and terminal-status validation. Other operation
mismatches continue to fail closed. A remotely discovered `NewDataset` job without request context stays
generic because the wire value alone cannot distinguish Edition from Update.

Export success means a generated, validated candidate, not publication to S-128. User-facing labels
remain S-101/S-57 and Cancel Export. The S100 alias remains valid for Product export metadata only.

Active jobs persist in browser storage and resume after reload. Cross-tab reconciliation combines
storage, BroadcastChannel and focus/visibility updates; backend active-job discovery provides shared
visibility. Every mutation verifies active jobs first. Concurrent verification for the same Product is
coalesced so popup watchers and mutation preflight share one authoritative in-flight request instead of
invalidating each other. Failed, malformed or mismatched responses cannot authorize a mutation. Status
polls retain finite request timeouts and bounded backoff while keeping an unknown active job locked in
the UI.

Known workflow states constrain export; backend mapping/version/candidate checks remain authoritative.
The legacy Send simulation is not an FI-029 popup workflow dispatcher. Any separate
local demo-only Send/Accept flow requires an explicit development opt-in and must not
be interpreted as real IC-ENC delivery or backend-authoritative state.
S57 Freeze/Unfreeze is unavailable because the current upload routes write S-101 explicitly.
Paper Charts/S102 cannot dispatch electronic mutations or read electronic History/artifacts.

## History and diagnostics

History uses registry loader permission and verifies the requested identity. Dashboard retains its
one-argument backend History adapter. BE-108A Events/EventTotalHits and deterministic StateRecordId
association are unchanged; no producers or timestamp deduplication are added.

Validation artifact normalization is shared by popup metadata, Analyze and Review. Only current
public diagnostic download routes are exposed; track/revision identity remains available in history.
No general distribution download or IC-ENC report contract is fabricated.

## Terminology

Use Product/Products in UI text. Keep backend identifiers such as datasetName, exportTarget and
internal rollback state where they are real contracts. Canonical routes remain
`/Analyze?Datasets=...` and `/Review?Datasets=...`.
