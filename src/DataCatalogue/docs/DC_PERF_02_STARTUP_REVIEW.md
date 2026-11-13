# DC-PERF-02 — Main Map startup request optimization review

## Verified source and scope

- Baseline: `917aaef68f6c6297df78fbb1670f5b5231385579`.
- Backend controller and repository files in the verified export are used as
  read-only contract evidence, not as a basis for backend changes.
- This candidate optimizes only the Package metadata wave in live Main Map.
  There is no runtime benchmark, new endpoint, caching mechanism or loader.

## Current request dependency graph

1. `createPipelineVisibility` reads one Pipeline catalogue and the paginated
   Workspace catalogue (the initial read is shared with `ensureLoaded()`).
2. `liveJobServiceAdapter` reads paginated Package memberships for each distinct
   Workspace, with up to four concurrent workers. These define the authoritative
   contextual Job identities and cannot be replaced by global Package bindings.
3. The new `loadLivePackageMetadata` helper deduplicates membership Package IDs.
   For 12–200 unique IDs, it asks `GET /v1/packages?hasPipeline=true&pageSize=1`
   for the total assigned count. If `totalCount` is at least the member count,
   at most 200 and at most four times the member count, it fetches a complete
   assigned list page and verifies that all required Package IDs occur exactly
   once. Otherwise it uses the unchanged six-worker `/v1/packages/{id}` path.
   Changed counts, missing IDs or incomplete list pages fall back to **all**
   targeted reads, never a mixed snapshot. Contract errors and failed requests
   remain visible. Manual Refresh always fetches again.
4. `mapController` independently requests Workspace detail geometry (up to four
   concurrent requests) and paginated assigned Package AOIs for selected
   Pipelines, applying the confirmed Workspace-member visibility scope. These
   read paths were not modified.
5. Live UI remains available before these independent reads finish. The
   `DC-UX-LOADER-01` unified live loader is a separate future task.

## Quantified request model, not a timing claim

Let `W` be the Workspace count and `U` the number of unique Packages across
all Workspace-membership pages. Prior metadata traffic is `U` individual GETs.
With a qualifying assigned list, metadata traffic is two paginated GETs, so
`U - 2` calls are avoided. The deterministic fixture with `U=30` and an
assigned catalogue of 60 Items verifies 30 -> 2 metadata calls. The membership
reads (`sum(max(1, ceil(M_i/200)))`), Workspace geometry reads (up to `W`),
Pipeline/Workspace catalogue pages and overview AOI pages remain unchanged.

For large or sparse assigned catalogues, a one-item probe is followed by the
original `U` targeted reads: there is **one additional GET** in that case,
though no unbounded metadata download. With fewer than 12 or more than 200
unique member IDs the helper skips the probe entirely. No conclusion about
improved loading time can be drawn without measuring response sizes and the
browser request waterfall.

## Source-backed trade-offs and follow-up

The backend's `GET /v1/packages` uses a Package subscription projection;
`GET /v1/packages/{id}` reads event state. Both map to `PackageResponse`, and
list normalization preserves exact uint64 Severity, categories, title,
descriptions, timestamps and active Pipeline summaries. However the API does
not supply a snapshot/revision token across membership and summary reads.
Identity/count guards detect incomplete pages, but not every case of transient
projection staleness. Verify recent Package edits and assignment changes on
the live backend.

The current verified frontend service exposes no bulk Workspace-membership or
Workspace-geometry API. If real waterfall data show these as the dominant
bottleneck, the backend owner must define an authorized, paginated read of
contextual Package membership and summary fields, and/or batched Workspace
coverage, including consistency/version semantics. Do not invent an endpoint
or suppress Workspace-level Job identity to reduce HTTP count.

The future unified startup gate must be based on measured required resources;
optional Package detail geometry and basemap tiles must not indefinitely block
Main Map interaction. The mock startup lifecycle must remain unchanged.

## Required local evidence

See `DC_PERF_02_VALIDATION.md` for the full cold/warm network measurement,
manual Refresh, race, filter, detail and failed-request checklists. No HAR,
backend log, production timing, full npm toolchain or real ArcGIS browser
session was available during this candidate's source-level verification.
