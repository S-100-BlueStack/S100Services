DPC associated source archives - 2026-10-29

Reviewed source
  Attached clean main snapshot 09e712e5eaa194ece996277e642683aef34aa3fe.
  All 875 source hashes matched the included manifest before edits.

Changes
  The bounded DPC scanner now requires and inspects all six source archives:
  S100.Point, PointSet, Curve, Surface, FeatureType and InformationType.
  The actual repository schema and export pipeline spell the last table
  informationtype and use the plural fields informationbindings/featurebindings.
  Non-spatial records need neither nominalscale nor geometry. As in the actual
  exporter, no ps filter is imposed on targets; incoming owners are S-101 rows
  and establish their product membership even when a target has no ps value.

  InformationType membership follows incoming informationBindings[].informationId;
  FeatureType membership follows featureBindings[].featureId. The actual export
  pipeline confirms both paths and emits non-spatial features as NoGeometry.
  Feature bindings with roleType "association" remain excluded exactly as in
  that pipeline. Information bindings with that roleType are supported.

  The reverse pass runs only when a non-spatial archive has in-window events.
  For each spatial class it reads identity/date/binding columns at both exact
  archive endpoints in one query. Only matching archive owner versions are
  retained; their geometry and scale are fetched in batches of up to 256.
  Every changed target on one owner shares one spatial match. Existing exact
  cursor caching in RunAsync reuses the complete scan across products with the
  same lower bound. No database query is issued for each changed target/product,
  and no persistent reference cache can outlive a binding edit.

  Endpoint owners include unchanged rows and historical rows removed/unlinked
  during the window. Intermediate-only and post-cutoff versions cannot establish
  membership. Owner nominalscale, matching DataCoverage and exact S-128 AOI
  intersection remain mandatory. Final inclusion additionally requires the real
  topology selection to emit the associated record through a selected owner.
  Changes retain the actual target GUID, type, attribute paths and archive date.
  Persisted information IDs now provide removal evidence alongside feature FOIDs.
  These are direct incoming bindings, matching the existing export pipeline;
  no new transitive association traversal is introduced.

  Candidate pairing, ready/error refresh, cumulative baselines, independent
  versions, durable replay, delivery protections and S-128 publication are
  unchanged. No SQL migration, permission, Windows SSO, operator gate, compiler
  configuration or SevenCs severity policy was changed.

Regression coverage
  DpcRunAsyncTests uses the real coordinator and export service with fixed clocks
  and archive intervals. New cases cover both target kinds: normal paired
  creation, full/partial revert, held replacement and release, orphan/unselected
  suppression, deletion and cumulative removal, 08:00 vs 10:00 replay after
  X->Y->X, and cancellation/restart from the same snapshot. Disabled FeatureType
  and InformationType archives preserve the watermark, candidates and replay.
  The fixture uses the production ArchiveBindingIndex and endpoint composer.

  ArchiveBindingIndexTests cover the supplied information JSON, unchanged owners,
  multiple targets/products, independent namespaces, endpoint scale changes,
  deleted/unlinked owners, replay bounds, fractional boundaries, transient and
  future versions, unrelated links, skipped feature roles and malformed JSON.
  EncSnapshotMembershipTests serialize real YAML information/non-spatial feature
  records and reject nested association targets as standalone membership proof.
  ProductManagerCoverageMatcherTests exercise the production ArcGIS matcher with
  incoming owners inside/outside DataCoverage/AOI and at a different scale.

Verification here
  The filtered dotnet test command was attempted and stopped with exit 127:
  dotnet: command not found. No .NET regression tests were executed or compiled.
  Windows, ArcGIS, SQL Server and external compiler execution are unavailable.
  Static source/diff checks and ZIP/hash/staging-list checks are reported with
  the delivery. A disposable checkout validates extraction/staging outside the
  checkout on Linux; this does not execute or validate the BAT on Windows.

Run on the Windows development machine
  dotnet test tests/TestProductManager/TestProductManager.csproj -c Debug -p:Platform=x64 --filter "FullyQualifiedName~DpcRunAsyncTests|FullyQualifiedName~ArchiveBindingIndexTests|FullyQualifiedName~EncSnapshotMembershipTests|FullyQualifiedName~ProductManagerCoverageMatcherTests|FullyQualifiedName~VerifiedSourceFeatureTrackerTests"
  Retain the existing migration-backed DpcSqlTransactionTests run against its
  explicitly configured disposable SQL Server database. No SQL code changed.
  Also verify a disposable archived S-101 geodatabase: change only SpatialQuality
  attributes, then an incoming FeatureType target, with owners at two scales and
  one outside the product topology. Check matched candidate GUIDs, shared YAML,
  archive owner OID/interval handling and binding-query counters. Exercise unlink,
  target deletion, disabled archives and restart. The real six-table ArcGIS scan
  and real S101/S57 compiler runs remain environment-dependent checks.

Delivery
  Keep ProductCatalogue-AssociatedArchive-20261029-01.bat beside its matching ZIP.
  Run from any folder. It verifies the Git root and project markers at exactly
  C:\source\S-100-BlueStack\S100Services, extracts/stages only the explicit changed
  files, prints staged count/status and auto-closes, retaining its matching log.
  It never switches/creates branches or checks HEAD/revisions.
  ZIP entries contain only changed repository files. The ZIP comment contains a
  SHA-256 manifest and gzip/base64 Git binary patch for optional review; the BAT
  uses neither. Build/deploy API and Worker together with the updated core.
  Ensure FeatureType and InformationType archiving is enabled before deployment;
  an incomplete six-class source is deliberately rejected without progress.

Suggested commit
  Detect associated InformationType and FeatureType edits in DPC
