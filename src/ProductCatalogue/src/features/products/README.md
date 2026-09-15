# Products

Shared Product helpers serve Main map, Analyze, Review and Dashboard.
The [normalized workflow contract review](../../../docs/normalized-workflow-frontend-adaptation.md)
is the current integration reference against `345b79eef2a9225473d57db80243e731739cbc3a`.

## Catalog and identity

The shared Product picker uses the lightweight `GET electronicproducts` name list only for dataset-name
selection. `workspaceProductService` resolves an opened Analyze/Review Product with the targeted
`GET electronicproducts/{datasetName}/aoi` contract, whose response supplies authoritative
`ProductSpecification` and source-owned geometry. Main-map S57/S101 layers continue to use their
specification-scoped bulk AOI endpoints.

Each resolved Product retains sourceId, productKey, datasetName and registry capabilities/content
configuration. The frontend never derives source from dataset-name patterns. Globally unique datasetName
remains the public route identity; a backend identity conflict or malformed targeted response fails closed
instead of falling back to a bulk source catalog. Workspace availability respects deployment
configuration but is independent of Main-map source toggles.

## Jobs and mutations

```text
POST /export/{datasetName}/newedition
POST /export/{datasetName}/newupdate
POST /export/{datasetName}/cancel-export
GET /jobs/{jobId}
GET /jobs/active?datasetName={datasetName}
```

The backend resolves specification from the exact Product; no exportTarget query is sent.
Operations are ExportEdition, ExportUpdate and CancelExport. Export success means a generated,
validated candidate, not publication to S-128. User-facing labels remain S-101/S-57 and Cancel Export.
The S100 alias remains valid for Product export metadata only.

Active jobs persist in browser storage and resume after reload. Cross-tab reconciliation combines
storage, BroadcastChannel and focus/visibility updates; backend active-job discovery provides shared
visibility. Every mutation verifies active jobs first. Concurrent verification for the same Product is
coalesced so popup watchers and mutation preflight share one authoritative in-flight request instead of
invalidating each other. Failed, malformed or mismatched responses cannot authorize a mutation. Status
polls retain finite request timeouts and bounded backoff while keeping an unknown active job locked in
the UI.

Known workflow states constrain export; backend mapping/version/candidate checks remain authoritative.
Send is a capability-gated simulation from ReadyForDistribution, never real delivery.
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
