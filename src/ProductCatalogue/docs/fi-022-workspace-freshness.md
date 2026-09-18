# FI-022 Workspace Freshness

## Scope

FI-022 keeps already-open Analyze and Review workspaces current after Product Catalogue backend changes without continuously reloading Product metadata, History, validation artifacts, or ArcGIS AOI geometry.

The implementation is automatic-first. A manual `Refresh` control remains available as a recovery path.

## Backend contract

The API exposes:

```text
GET /electronicproducts/workspace/freshness?datasetNames=ProductA&datasetNames=ProductB
```

The API request is bounded to 50 unique Product names. The frontend transparently splits larger workspaces into independent batches of at most 50 names, so the server-side bound does not become a workspace-composition limit. Each response item contains the resolved `DatasetName`, an opaque `Revision`, and `Available`. Unsupported or unresolved Product names return `Available=false` instead of failing the complete mixed-source request.

The revision is intentionally opaque to the frontend. It is derived from the workspace-visible state owned by the current API process and System database:

- cached S-128 Product metadata used by the workspace;
- the related S-57/S-101 Product mapping known by the in-memory ProductManager index;
- SQL workflow-track state/version and `row_version`;
- state-history count and latest state identity;
- validation-artifact count and latest artifact identity;
- finalized Product History audit-event revision.

The freshness repository returns compact revision signals only. It does not materialize Product History bodies or artifact content.

## ArcGIS isolation boundary

The freshness endpoint must remain outside ArcGIS execution lanes. It uses the ProductManager's existing in-memory Product/mapping index plus SQL reads and does not call `ReadElectronicProductVersionAsync`, targeted AOI routes, Hangfire, or the background worker.

A detected revision change can cause the workspace to perform its normal targeted Product reload. That is event-driven work after a real backend change, not periodic ArcGIS polling, and preserves the FI-024/FI-025 boundaries.

Direct external edits to S-128 that bypass the running ProductManager cache are outside FI-022. The existing public Product endpoint has the same cache boundary; solving cross-process S-128 cache invalidation requires a separate authoritative contract.

## Frontend lifecycle

Analyze and Review create a route-local freshness monitor with these rules:

- the initial revision snapshot is captured before workspace content is loaded;
- while the document is visible, the lightweight freshness endpoint is checked every 30 seconds;
- hidden tabs do not perform interval checks;
- returning to a visible tab performs an immediate check;
- when a known Product operation stops running, the workspace performs an immediate check;
- concurrent freshness checks are coalesced;
- a first observation establishes a baseline and does not trigger a reload;
- changed Products are refreshed without replacing unaffected Product content;
- the monitor commits a changed revision only after the corresponding refresh publishes successfully, so a transient refresh failure is retried later;
- if the initial revision snapshot fails, the first recovered freshness observation refreshes the affected workspace Products before accepting a new baseline;
- full route/manual loads prime a new revision baseline and supersede stale checks; Review composition edits preserve surviving baselines and prime only newly loaded Products;
- each Review freshness observation captures the current composition-retention epoch; `retain()` advances that epoch, so an observation started before an add/remove/enable/disable boundary is discarded before it can call `onChanged` or update revision bookkeeping;
- additional Product priming keeps its existing per-Product ownership and is not invalidated merely because another Product is added;
- destroying the workspace invalidates late freshness responses.

Analyze retains its current map layers during automatic content refresh. Its Product cards, Product History, validation artifacts and metadata are replaced for changed Products only. The normal route/manual load path remains responsible for AOI/layer reconstruction and map zoom behavior.

Review merges refreshed Product content into the existing enabled Product order and leaves user-selected per-Product content toggles untouched.

## Manual refresh

Both workspaces expose a compact manual Refresh control. Analyze places a square icon-only Refresh action immediately before `Open all`; its hover/accessibility text explains that it refreshes Product metadata, History, and validation content without adding another row above the Product cards. The control uses the existing Analyze action-button styling with a Calcite refresh icon so the visible button and hit area remain the same square size without depending on Calcite Button shadow-DOM layout. Review retains its compact sidebar Refresh control. Manual refresh uses the established full workspace load lifecycle, including its generation guards and source-aware Product resolution. It is a fallback/recovery action rather than the primary freshness mechanism.

## Failure behavior

Freshness checks fail silently except for console diagnostics. The last successful workspace content remains visible.

Automatic Product refresh failures do not advance the stored revision, so later checks retry the same backend change. Manual refresh failures use the existing user-facing notice behavior.

Unsupported Product sources remain fail-closed through `Available=false`; the freshness contract does not route one source through another source's backend workflow.

## Dependencies and persistence

FI-022 adds no npm or NuGet dependency and no database migration. It reuses the normalized Product workflow tables and the existing BE-108A audit table.

## FI-039 incremental Review reconciliation

Status: **Implemented; manual verification pending**.

Review composition edits now retain surviving Product payloads and pending requests under one
`createReviewProductSession` generation owner. Additions seed only their own revisions through
`primeAdditional` before loading. This leaves changed-revision detection for surviving Products intact.
`retain` removes revision bookkeeping for removed Products without a network request. Disabled retained
Products keep their last revision baseline; they are not polled until enabled again. Additional-prime
failure recovery is scoped to the affected Products. Analyze retains the default enabled-name behavior.

Full Review initial/route/manual loads still use `prime`. Automatic refresh uses the same Review session
owner as composition changes, reloads only changed Products, and acknowledges only owned results.
A Product already loading declines freshness publication for retry instead of starting duplicate work.
The acknowledgement is atomic for the entire requested changed set. If any requested Product is no
longer enabled/present, Review declines the whole observation before starting Product loads. It also
rechecks eligibility and record ownership before acknowledging completed work. Disabled Products keep
their previous revision baseline/recovery obligation, so enabling them allows a later normal check to
retry. Removed Products lose their revision bookkeeping through `retain`. Review `retain()` also advances
a composition-observation epoch: a freshness response captured before an add/remove/enable/disable edit
is discarded before `onChanged` and before any revision baseline update. This prevents old observations
from crossing remove/re-add membership boundaries or acknowledging replacement membership state. The next
normal current-composition check retries as needed. Additional Product priming remains independently owned,
so unrelated new-Product primes are not cancelled. No additional timer, Review data-generation owner or
backend endpoint is introduced.

See [FI-039 implementation and verification](fi-039-incremental-review.md) for generation boundaries,
source-aware identity, independent failure behavior, regression counts and the manual checklist.
