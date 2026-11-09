# DPC bulk archive scans

DPC first performs the existing bounded all-product detection. If package,
replay or failed-attempt comparisons need other lower boundaries, it lazily
loads one reusable archive history from the oldest required boundary through
the same invocation cutoff. There are at most two archive detection passes per
connection per invocation, rather than one per distinct package timestamp.
Incoming binding resolution still performs its own bounded owner queries.

The reusable history stores archived versions and the existing scale,
DataCoverage and AOI matches. Product indexes allow each subsequent comparison
to inspect only that source's candidate feature identities. Net changes are
recomposed against the exact requested boundary. Reusing a net diff by filtering
its timestamps would lose intermediate changes and reversions and is not used.
Incoming owners at every required endpoint are retained, including versions
that exist only at an intermediate package boundary. Native rows, cursors,
tables and connections are disposed during loading. Geometry comparisons stay
on the product manager's ArcGIS execution lane. The reader is sequential and
invocation-scoped; it is disposed on completion, failure or cancellation.

All required inspections still finish before candidate replacement. Import
baseline clamping, fixed UTC cutoffs, holds, delivery protection, failed-source
retry gates, persisted YAML pairing and checkpoint ordering remain in place.
No system-database migration or S-101/S-128 write is introduced. Alternative
product managers without the optional archive-reader capability retain their
existing bounded-scan behavior.

There is no feature-count threshold or automatic import exclusion. Larger
legitimate edits remain eligible. A deliberate re-import must still use the
completed import's ArchiveBaselineUtc. This optimization cannot make malformed
archive data valid or prevent a failed inspection from retaining its checkpoint.

Per-feature archive messages now use Debug. Information retains table totals
and reports reusable-history loading and each source comparison. Cancellation
is checked between archive rows and source features; an individual blocking
ArcGIS/database call still has to return before it can be observed.

Validation on the production Windows/.NET 10/ArcGIS toolchain:

```powershell
dotnet restore Nexus.slnx
dotnet build Nexus.slnx -c Debug -p:Platform=x64
dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --no-build --filter "FullyQualifiedName~DpcArchiveHistoryTests|FullyQualifiedName~DpcRunAsyncTests|FullyQualifiedName~DpcImportBaselineTests"
```

The current solution links the regression sources under tests/TestProductCatalogue
into TestProductManager. Run live SQL/geodatabase tests only against explicitly
confirmed isolated targets. On an isolated re-import, expect one initial scan,
at most one reusable-history read, and subsequent source comparison messages
without further archive-table passes. Ordinary single edits, bulk edits,
hold/release, failed snapshots and changes arriving during a scan should retain
their existing paired-export behavior.
