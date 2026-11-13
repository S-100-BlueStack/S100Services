# PC-ICENC-02 - IC-ENC artifact integration

## Source and authority

- **Repository:** `S100Services`.
- **Baseline:** `fee186f8c809a1882e51699baf1d0323bcc57dc5` (includes accepted frontend `3b6b6afbb62a1504041adb0bae93b11f30dc48d8`).
- **Evidence:** exact verified committed frontend export (556 files) and backend integration export (156 files), including source checksums and Git blobs.
- **Scope:** read-only Product IC-ENC report downloads. No new endpoints, credentials, backend changes or Package actions.

## Verified public contract

`GET electronicproducts/{datasetName}/artifacts/history` returns an `ApiResponse` with artifact rows containing `Id`, `TrackId`, `RevisionId`, `DatasetName`, `ProductSpecification`, `Kind`, `FileName`, `MediaType`, `CreatedAtUtc` and `Url`.

The public API uses `ProductArtifactKind.IcEncReport` for stored IC-ENC attachments, and `ValidationReport` or `ValidationDiagnostic` for internal validation. `normalizeArtifactHistory()` validates public artifact URLs and normalizes Product identity, specification, revision and kind. The URL leads to the public `GET electronicproducts/{datasetName}/artifacts/{artifactId}` route.

`partitionValidationArtifacts()` requires exact supported kinds; unknown/missing kinds are omitted. For Package members, `selectPackageValidationArtifacts()` further requires matching Product identity and specification, rejecting ambiguous/contradictory ownership without falling back to file names. Historical revision IDs are retained; revision filtering is intentionally not inferred.

## Frontend behavior

- **Analyze:** Electronic Products obtain metadata and artifact history through their existing request lifecycle. Each Product's one artifact response is partitioned between `Internal validation` and `IC-ENC`; the latter displays `Attachment`, original file names, stored timestamps and revision IDs. Empty, failed and unsupported source states remain truthful. XML content for compatibility sources is unchanged.
- **Review:** The existing independent History/artifact reads serve both report sections. IC-ENC uses the same accessible card patterns and bounded scrolling as internal validation, but only draws files of kind `IcEncReport`. Package members retain their own identities and historical revision references. The existing generation/selection guards remain authoritative.
- **Dashboard (v2):** IC-ENC and Validation actions open the existing History-style right-column panel, replacing summary panels rather than expanding inline content in activity rows. Direct activity-provided URLs remain available. Without a direct URL, opening the selected panel resolves the Product and loads verified artifacts on demand. Switching panel/activity, closing or pressing Escape invalidates stale results. Loading, empty, error and excluded-file states stay inside the panel; no eager per-row artifact fetches are added. The shared panel styling, selected row state and keyboard focus handling are preserved.

The backend's `electronicproducts/dashboard` activity projection currently returns `IcEncReports: []`, so server-side IC-ENC report filters, counts and attribution to a specific **activity** do not become accurate as a result of this change. The on-demand list is the Product's full verified artifact history, not proof that a file belongs to the clicked activity.

## Outstanding backend-owned contracts

1. A bounded Product/revision-specific IC-ENC decision history (Accepted, Rejected, pending/review-required), with receipt provenance and timestamps. The artifact history lists stored files, not notice verdicts.
2. Populated Dashboard activity report references/counts and server-side report filtering where required.
3. A server-authorized operator review UI/API without exposing `X-ICENC-Operator-Key` in browser code. The global mailbox audit endpoint is not a Product-scoped report read model.
4. A separate backend decision for mixed Accepted/Rejected Package finalization, if the published accepted-sibling behavior is required. Frontend Accept continues to use backend-owned `CanAcknowledge` and the existing endpoint; this task does not change it.

## Acceptance checklist

1. Analyze electronic Product with an `IcEncReport`: correct section, exact file name, revision and one working download. Internal diagnostics appear **only** under Internal validation.
2. Analyze S-101/S-57 Package with mixed member artifacts: downloads never appear under the wrong member. Empty/unsupported/failed states show no fabricated report.
3. Review the same Package: both members show their own IC-ENC files and version metadata; expanding, scrolling and History work without losing selection.
4. Dashboard: both report actions open the History-style right panel. The panel replaces summary sections, never inserts inline report lists, and restores them on close/Escape. Direct URLs remain accessible; missing URLs trigger the Product-scoped lookup only when opened. Switching IC-ENC/Validation, closing/reopening or opening History must not show stale files or duplicate logical requests. Empty, failed and excluded-file states are explicit.
5. Verify light/dark mode, keyboard, Escape/route teardown, rapid Product navigation, report download with real API authorization, failure and retry.
6. Run the local ProductCatalogue gate: `npm run format` and `npm run check` from `src/ProductCatalogue`. Browser/backend acceptance remains user-owned.

No package dependencies, `package-lock.json`, API/auth contracts, backend projects, DataCatalogue files or migrations are changed.
