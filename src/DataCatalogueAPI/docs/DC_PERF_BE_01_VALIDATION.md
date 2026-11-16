# DC-PERF-BE-01 — Shared Workspace Detail / Membership Batching

## Scope and provenance

- Source: `bcd52ce9192b82f629a9fc2e1e20e1cf40a3b851` (commit-pinned, 113/113 source SHA-256 and Git blob IDs verified).
- This is a backward-compatible performance candidate: no frontend change,
  new HTTP endpoint/DTO, auth-policy change, ArcGIS CoreHost/thread change, or
  persistent cached geometry.
- Main Map HAR context: 33 Workspace detail requests, 33 Workspace membership
  requests, and approximately 21.55 seconds for the recorded cold startup.
  HAR alone does not identify ArcGIS CPU time or guarantee a performance gain.

## Implementation

1. The existing `WorkspacePackageReadBatcher` now accepts both detail and
   membership requests within a bounded window (four requests, six milliseconds).
2. Each Workspace is validated against the current Pipeline event state before
   dispatch. One STA action opens one Dispatcher coverage scope for a batch;
   duplicate geometry references are read once within the batch.
3. Membership queries retain the separate Package geodatabase scope, spatial
   membership filter, Pipeline binding, current AOI-reference check, Package-ID
   ordering, pagination and JSON hydration for page rows. Details serialize
   their complete Esri polygon on the ArcGIS thread.
4. One canceled request does not cancel a sibling. For a shared geometry read,
   the batch uses an independent token so one canceled consumer cannot cancel
   another; every consumer checks its own cancellation before publishing. If all
   consumers cancel during a shared native read, the native operation can still
   finish before the batch is discarded.
5. A failure opening the shared coverage scope affects all members. A Package
   scope failure affects only membership readers; an individual geometry failure
   affects only that Workspace's readers. No cross-request geometry cache exists.

## Logging

The existing `Workspace packages read` event retains its fields. Its `BatchSize`
now includes both kinds of reads admitted to one dispatcher action (maximum 4),
and `WorkspaceScopeMs` / deduplicated `WorkspaceGeometryMs` can be shared values.

New `Workspace detail read` structured log fields:

| Field | Meaning |
| --- | --- |
| `Outcome` | `Succeeded`, `Failed`, or `Canceled` |
| `EventStateMs` | Event-state lookup and Pipeline/Workspace validation |
| `BatchSize` | Active detail + membership requests within the same STA action |
| `BatchWaitMs` | Time admitted to the batch before dispatcher submission |
| `ArcGisQueueWaitMs` | Shared dispatcher queue wait for the action |
| `WorkspaceScopeMs` | Shared geodatabase/feature-class setup for the batch |
| `WorkspaceGeometryMs` | Geometry-read duration; may be shared by duplicate references |
| `SerializationMs` | Detail polygon Esri JSON serialization on the STA thread |
| `TotalMs` | Entire service wall-clock time |

Do not sum shared timings across HTTP requests to estimate ArcGIS execution time.

## Required local verification

From repository root on Windows x64 with .NET 10, installed/licensed ArcGIS Pro,
configured sample geodatabase and the existing test fixtures:

```powershell
dotnet build src/DataCatalogueAPI/DataCatalogueAPI.csproj -p:Platform=x64
dotnet test tests/DataCatalogueAPI.Tests/DataCatalogueAPI.Tests.csproj -p:Platform=x64 --filter "FullyQualifiedName~WorkspaceAndRoutingTests"
```

Focused tests added under `WorkspaceAndRoutingTests` cover mixed detail +
membership bursts across Pipelines, individual request validation, three
concurrent details with a duplicate geometry reference, pre-canceled detail
reads, and one canceled detail while a membership request is queued.
Existing tests cover Package pagination/current AOI, missing Workspace
isolation and cancellation during batched membership reads.

## Manual performance comparison

1. Run the same frontend and API binaries, data, browser, basemap and credentials
   with the accepted backend baseline and this candidate separately. Restart
   as needed; warm the CoreHost and run at least ten subsequent page loads.
2. Record Main Map `Jobs ready` time from navigation (not Network's final tile),
   details/member HTTP request count and median/p95 duration, and HTTP errors.
3. Compare `Workspace detail read` and `Workspace packages read` events:
   batch size, coverage scope time, actual geometry time, queue wait and total.
   Confirm mixed batches occur; if they do not, do not attribute a speedup to
   geometry deduplication. Package JSON and authoritative Workspace memberships
   must remain identical.
4. Repeat with a single Workspace, several overlapping Workspaces and a
   Workspace without any Package memberships. Verify two Pipelines and rapid
   navigation/Refresh while requests are running. Aborted older requests must
   never publish a successful stale response.
5. Check unrelated ArcGIS requests for starvation during bursts. If response
   time regresses, restore the baseline while retaining timing evidence.

## Outstanding constraints

The source export does not include the local ArcGIS Pro binaries, test fixture
files or a .NET 10 SDK in this execution environment. Build, integration tests
and runtime benchmarking must be performed on the Windows development host.
The proposed batch does not remove HTTP fan-out, so a backend bulk endpoint
remains a potential next stage if total latency is still dominated by 66 calls.
