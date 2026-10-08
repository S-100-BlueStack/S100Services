# Product Catalogue — Package-aware Analyze / Review / History discovery

## Status

Read-only frontend discovery.

No source files were changed.

Authoritative baseline:

`df7d088ea3f43c3afeef0faa93e108af4c9638f1`

## Current implementation after F6B

F6B implements package-aware Analyze against `a5360531032c2baeb8d5544cf7b8e7cb15a7551f`.
The discovery findings below remain a historical design record. F6A reports are unchanged.
Analyze now uses the canonical work-unit resolver, one S-101 route identity, one shared map Graphic,
and ordered member presentation. Only package Analyze navigation is enabled.
F6C Review and F6D floating Product History remain deferred; package Review/History navigation and
Pause, Resume, Discard, Send, Accept and scheduling remain disabled/fail closed.
See the historical [F6B v1 implementation report](package-analyze-F6B-implementation-report.md),
the historical [F6B v2 correction report](package-analyze-F6B-v2-correction-report.md),
the historical [F6B v3 correction report](package-analyze-F6B-v3-correction-report.md),
the historical [F6B v4 correction report](package-analyze-F6B-v4-correction-report.md),
and the current [F6B v5 correction report](package-analyze-F6B-v5-correction-report.md).
V2 reconciles final alias claims and gives package map replacement a dedicated layer boundary,
so unrelated ordinary Product Graphics/popups retain their existing freshness lifecycle.
V3 preserves both v2 corrections and closes targeted package staging ownership: construction stays
off-map, and published pending registration is synchronously cancelled by newer generations or destroy.
V4 preserves that lifecycle and projects accepted Analyze member Product statuses onto the one shared
package Graphic, opting only its layer into the existing F2 member-aware palette/CIM hatch pipeline.
V5 preserves the accepted rendering/lifecycle and scopes combined validation artifact history to each
exact member Product by concrete dataset identity and authoritative specification before publication.

## Goal

Determine how the accepted ENC package work-unit model can extend from the Main map into
Analyze, Review and Product History without:

- splitting S-101 and S-57 into unrelated top-level work units;
- inventing backend package contracts;
- moving package mutation actions into Analyze/Review;
- regressing existing simple-Product workflows;
- creating duplicate freshness/request lifecycles.

## Current repository boundaries

### Main map

The S-101 registry source owns the ENC package work-unit declaration:

- `kind: "package"`
- primary member `s101`
- ordered members `s101`, `s57`

Main-map ProductContext overlays `workUnit.navigationCapabilities`, which currently disables
Analyze, Review and History for package-originated navigation.

The Product Collection stores one package representative and preserves only the resulting
Analyze/Review navigation booleans. It does not persist the complete work-unit declaration.

### Workspace resolution

`workspaceProductService` can resolve both S-101 and S-57 directly through the targeted
`GET electronicproducts/{name}/aoi` route.

The S-57 source is not Main-map selectable, but it is still workspace-capable.

A current gap is that `createWorkspaceProductContext` does not carry the registry `workUnit`
declaration. Registry workspace entries therefore resolve as direct Product contexts rather than
package work units.

This also means a manually authored Analyze/Review route can currently resolve the package's
S-101 representative as an ordinary S-101 Product even though Main-map navigation is disabled.

### Existing backend reads are sufficient for an initial frontend implementation

No new backend read endpoint is required for the proposed first package-aware workspace slice.

Existing contracts provide:

1. `GET electronicproducts/{name}`
   - authoritative current S-101 identity/version;
   - authoritative current S-57 identity/version;
   - active export metadata.

2. `GET electronicproducts/{name}/aoi`
   - resolves either S-101 or S-57;
   - returns the shared S-101 boundary for mapped S-57;
   - supplies Product specification and Product-level metadata.

3. `GET electronicproducts/{name}/history`
   - Product-level History can remain independently loaded for each member.

4. `GET electronicproducts/{name}/artifacts/history`
   - validation artifacts can remain independently loaded for each member.

5. `GET electronicproducts/workspace/freshness`
   - the backend revision for an electronic Product includes related mapped S-57/S-101 names and
     workflow signals;
   - one representative package freshness token can therefore invalidate the complete package
     workspace payload.

The frontend must still fail closed if member mapping is incomplete or ambiguous.

## Recommended work-unit model

### Stable route identity

Keep the existing `Datasets=` route contract.

For an ENC package, the route contains only the canonical package representative:

`S-101 dataset name`

Do not encode both member names in the route.

This preserves:

- one package = one workspace item;
- Product Collection semantics;
- the existing route grammar;
- independent internal member loading without exposing it as route identity.

### Canonicalization

If a user manually selects or types the mapped S-57 name in Analyze/Review:

1. resolve it through the existing Product/detail contracts;
2. identify the mapped S-101 member;
3. canonicalize the workspace item to the S-101 package representative;
4. do not create a second top-level S-57 workspace item for the same package.

A mapping failure or ambiguous mapping must fail closed.

### Workspace ProductContext

Extend the registry/workspace ProductContext boundary so targeted electronic workspace resolution
can retain the registry `workUnit` declaration.

Do not infer a package from dataset-name patterns.

Package membership remains registry + backend metadata driven.

### Member contexts

A resolved package workspace item owns:

- one package/work-unit identity;
- one shared geometry;
- ordered member contexts:
  - S-101
  - S-57

Each member context retains its own:

- dataset name;
- current Edition/Update;
- Product status;
- History;
- validation artifacts;
- future IC-ENC content.

## Analyze recommendation

Represent the ENC package as one Analyze workspace item and one map Graphic.

Presentation:

- outer package card using the S-101 package name;
- two compact member sections inside the card, ordered S-101 then S-57;
- each member shows its own Product metadata, status, History and validation content;
- shared geometry is drawn once;
- no duplicate S-57 map Graphic;
- package mutation actions remain absent.

Workspace enable/disable and remove operate on the package, not on individual members.

This is preferred over two independent top-level Analyze Products because it preserves the accepted
work-unit identity and prevents the route/collection from silently splitting the package.

## Review recommendation

Represent the ENC package as one top-level Review column/work unit.

Inside that column:

- compact S-101 member section;
- compact S-57 member section;
- each member renders the selected Review content types independently.

For the first implementation, keep the existing Review content-type selection at package/work-unit
level:

- History toggle applies to both members;
- IC-ENC toggle applies to both members;
- Validation toggle applies to both members.

Do not add independent per-member content toggles in the first slice. They would introduce another
persistent interaction model without an identified requirement.

Stack the member sections vertically inside the package column rather than creating two top-level
Review columns. This avoids multiplying horizontal width and preserves package ownership.

## Product History recommendation

Keep History Product-level internally, but make the package History surface one work-unit view.

Recommended first layout:

- one existing floating History panel;
- package title/identity at the top;
- S-101 and S-57 sections inside;
- reuse the existing Product History renderer for each member;
- no synthesized package-history events;
- no cross-member ordering/merging in the first implementation.

This avoids inventing a backend package-history model.

A later true package timeline can be added if the backend exposes package lifecycle/audit events.

## Freshness and async lifecycle

Use one package freshness lifecycle keyed by the canonical S-101 representative.

A changed package revision reloads the complete package workspace payload under one generation.

The reload may perform independent member reads concurrently, but publication is atomic at the
package work-unit boundary:

- stale/superseded member loads cannot partially replace newer package state;
- one failed member does not silently transform the package into a single-member work unit;
- retained UI composition belongs to the package item;
- no second member-specific freshness timer is introduced.

Existing simple Product workspace freshness remains unchanged.

## Product picker / catalog impact

The current lightweight Product catalog is a flat list of backend Product names and can contain both
S-101 and S-57.

Package-aware workspace behavior therefore needs a canonical resolution layer rather than relying on
catalog display names alone.

The first implementation does not require changing the backend catalog response.

The frontend can canonicalize after targeted resolution and update the route/composition to the
S-101 package representative.

A later backend package-aware catalog could improve picker labels/performance, but it is not a
blocker.

## Failure behavior

Fail closed when:

- the package representative cannot be resolved;
- S-101/S-57 mapping is missing or ambiguous;
- a resolved member does not match the expected registry member specification;
- a package/member identity changes during an async load;
- the source/work-unit definition is replaced mid-flight.

Do not silently fall back to treating an incomplete ENC package as an ordinary S-101 Product.

## Backend impact

No backend change is required for this initial frontend work.

The previously discussed future package Send eligibility and mixed IC-ENC completion rules are not
required by Analyze/Review/History because these surfaces remain read-only.

Package actions remain outside this scope and fail closed.

## Suggested implementation sequence

### F6A — Workspace work-unit resolution foundation

- carry registry `workUnit` into targeted workspace ProductContext;
- canonicalize S-57 -> package representative;
- resolve member identities through existing Product metadata;
- add package/member workspace domain model;
- preserve existing routes;
- keep Analyze/Review/History navigation disabled until the relevant surface is ready;
- focused identity/canonicalization/generation tests.

### F6B — Package-aware Analyze

- one package route item;
- one shared map Graphic;
- two member sections;
- independent member History/validation reads;
- one package freshness lifecycle;
- existing simple Product behavior unchanged.

### F6C — Package-aware Review

- one package Review column;
- vertically stacked S-101/S-57 member sections;
- existing workspace content toggles apply to both members;
- atomic freshness publication;
- existing simple Product behavior unchanged.

### F6D — Package-aware floating Product History

- one package History panel;
- separate S-101/S-57 histories using existing renderer;
- no fabricated package timeline;
- enable Main-map History capability only after this slice is accepted.

## Decisions needed before implementation

1. Analyze layout:
   - recommended: one package card with stacked S-101/S-57 member sections.

2. Review layout:
   - recommended: one package column with stacked S-101/S-57 member sections.

3. Review content toggles:
   - recommended: package-level toggles apply to both members; no member-specific toggle state.

4. Floating Product History:
   - recommended: one panel with separate S-101 and S-57 sections; no merged timeline.

5. S-57 entered directly in a workspace picker:
   - recommended: canonicalize to its S-101 package representative rather than allowing a duplicate
     standalone S-57 top-level work unit.

These decisions are presentation/work-unit decisions only. They do not require a backend contract
change.
