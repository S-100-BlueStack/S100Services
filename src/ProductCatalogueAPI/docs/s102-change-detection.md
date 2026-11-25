# Bathymetric surface workflow

The IHO calls S-102 **Bathymetric Surface**. The catalogue footprint is an S-128 `ElectronicProduct` in `S100.surface`, classified by the product specification in its `attributeBindings`. The externally supplied exchange set contains the HDF5 grid and its discovery metadata. The new workflow uses the existing HDF5 engine kind to identify the export track. The producer creates and validates the exchange set.

## Start here for the change detector

Open `Services/S102/S102ChangeDetector.cs` and implement `BathymetricSurfaceChangeDetector.DetectAsync`. This is where the source database query or Python detection process belongs. The job supplies two UTC instants:

- `lastSuccessfulRunUtc` is the previous successful scan's upper bound. A null value means you must apply the agreed first-run source baseline.
- `scanThroughUtc` is the fixed upper bound for this invocation. When the source uses committed UTC timestamps, process edits after the lower bound and through the upper bound. Decide how the source handles late commits or tied timestamps before enabling the schedule.

Reuse a stable export ID when handing the same changed-dataset batch to the API again. Return from the detector once the source changes through the upper bound are durably recorded for processing. If an API lock conflict leaves any change unrecorded, retain it for retry or fail the scan. A successful run with zero changes still advances the checkpoint.

The worker registers `DetectBathymetricSurfaceChangesJob` as an `IBackgroundJob` implementation. It appends successful UTC boundaries to `dbo.JobRunState` under the historical `DetectS102ChangesJob` key. The placeholder throws, so it cannot advance the checkpoint. There is no recurring registration. Once the detector and first-run policy are ready, register the job alongside the existing recurring jobs under `BackgroundProcessing/Scheduling`.

## API

| Request | Contract |
| --- | --- |
| `GET /Lookup/packagelayers` | Includes `BathymetricSurface` with ID 2. |
| `GET /ElectronicProducts/aoi?layer=BathymetricSurface` | Existing AOI geometry envelope shape with `Attributes.BathymetricSurface` for export status, edition and artifact identifiers. The product footprint comes from S-128. |
| `POST /BathymetricSurfaces/changes` | JSON containing a caller-generated `ExportId` GUID and up to 100 `DatasetNames`. The response supplies the reserved edition and export status for each dataset. The batch reserves all exports together. |
| `POST /BathymetricSurfaces/{datasetName}/exports/{exportId}/complete` | Multipart form with `validationPassed`, the `exchangeSet` ZIP when validation passed, and an optional `validationArtifact` VLD. A failed export may report a diagnostic without a ZIP. |
| `GET /ElectronicProducts/{datasetName}/artifacts/{artifactId}` | Existing authorized artifact download. Use the completion result's `ValidationArtifactId`. |
| `POST /BathymetricSurfaces/{datasetName}/exports/{exportId}/send` | Returns HTTP 202 and a Hangfire job ID. Live sends require `X-ICENC-Operator-Key` for the bathymetric intake. |
| `POST /BathymetricSurfaces/{datasetName}/exports/{exportId}/deliveries/{deliveryId}/reconcile` | For an uncertain live transfer, an authorized operator supplies `receivedByIcEnc` after verifying the exact handoff with IC-ENC. |

The API uses the existing Windows SSO access, manage and distribute policies. The producer service identity needs access to the manage policy for both callbacks. Canonical names are resolved from the S-128 product metadata loaded by the Product Manager. Reload the host catalogue if new or renamed products were entered directly in the geodatabase.

Reporting a change moves the dataset to the same `ProductState.Exporting` used by S-101 and S-57. The change response and the bathymetric AOI both report `"Status": "Exporting"`. An identical callback replay returns the current state, and a stale or conflicting callback receives HTTP 409. A failed export enters `Error`. A successful one enters `ReadyForDistribution`. The exchange ZIP is limited to 64 MiB compressed and 256 MiB expanded. VLD is limited to 4 MiB. Align any IIS or proxy request limit with the 69 MiB multipart endpoint limit.

The current contract is for one dataset and a new edition per export. Use the reserved `Edition` in `CATALOG.XML` and the producer's HDF5 output. The successful ZIP must contain `S100_ROOT/CATALOG.XML`, `S100_ROOT/CATALOG.SIGN` and one directly packaged HDF5 dataset in the product's `DATASET_FILES` tree. Confirm that the producer's validator checks the HDF5 data and signatures. The API checks the archive layout, name and catalogue edition.

## Deploy and exercise the workflow

1. For an existing System database, apply `Data/Migrations/013_AddExternalExportOperation.sql` before deploying the API and worker. Fresh databases use `Create-All-Tables.sql`. This adds a nullable operation ID and a filtered index to the shared revision table.
2. Deploy API and worker from the same release. The workflow uses `ProductExportTrack`, `ProductRevision`, `ProductStateHistory`, `ProductArtifact` and `ProductIcEncDelivery`. A handoff leaves S-128 published metadata untouched.
3. Set `BathymetricSurfaceDelivery:Mode` to `Simulation` in both processes. Complete a validated export and queue Send. The resulting `Submitted` status has simulation provenance in the delivery ledger and makes no network request.
4. For live delivery, confirm the separate intake, FTPS certificate, directory layout and server-side directory move with IC-ENC. Configure `Mode=Live`, `Host`, `Port`, `Username`, `Password`, `OperatorKey`, `StagingRoot` and `IntakeRoot`. The staging and intake roots must be distinct existing directories. Use the secret provider or environment variables for `Password` and `OperatorKey`. The worker stages the full set outside the watched intake, verifies file sizes, then promotes the finished directory.
5. `Submitted` records the handoff. IC-ENC acceptance, mailbox integration and publication are separate follow-up work. The next new edition considers published and previously submitted live editions. Simulation deliveries do not advance that baseline.

If a live result is uncertain, the export stays locked. Confirm receipt with IC-ENC using the delivery ID and the remote directory `{datasetName}_{deliveryId:N}`. Use the reconciliation endpoint with `receivedByIcEnc=true` for a confirmed handoff or `false` for confirmed absence. A hard crash after reservation may leave the row `Sending`. An operator must first verify the worker stopped processing that job and use the delivery ledger to confirm the outcome before reconciling. Missing files in the current FTP listing alone do not prove that IC-ENC never received the exchange set.
