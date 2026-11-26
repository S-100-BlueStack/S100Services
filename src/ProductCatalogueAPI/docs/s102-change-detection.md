# Bathymetric surface workflow

The IHO calls S-102 **Bathymetric Surface**. The catalogue footprint is an S-128 `ElectronicProduct` in `S100.surface`, classified by the product specification in its `attributeBindings`. The externally supplied exchange set contains the HDF5 grid and its discovery metadata. The new workflow uses the existing HDF5 engine kind to identify the export track. The producer creates and validates the exchange set.

## Configure the worker

| Environment variable | Worker value |
| --- | --- |
| `S102ConstraintConnection` | HTTPS URL of the constraints service, ending at `/FeatureServer`. |
| `S102DeconflictedSurveyConnection` | HTTPS URL of the deconflicted surveys service, ending at `/FeatureServer`. |
| `S128AoiConnection` | HTTPS layer URL of the S-128 AOI feature service, ending at `/FeatureServer/<layerId>`. |
| `arcgis_portal_url` | HTTPS base URL of the Portal that federates both services, including its application path if present. |
| `arcgis_portal_user` | Portal credentials in `username::password` format. |
| `BathymetricChangeDetection__ApiBaseUrl` | ProductCatalogue API application URL, including the IIS virtual path if used. The appsettings equivalent is `BathymetricChangeDetection:ApiBaseUrl`. |

Make these variables available to the Windows service process. Use a Portal account with read access to the bathymetric and S-128 feature services. CoreHost uses those credentials only for challenges from the configured Portal. The HTTP client uses the Windows service identity. Give that identity `productmanager:manage` for reservation and completion. The API URL must point to the same environment whose System database and catalogue the worker is configured to use.

## Detector entry point

`BathymetricSurfaceChangeDetector.DetectAsync` in `Services/S102/S102ChangeDetector.cs` receives the previously saved UTC checkpoint and the fixed UTC cutoff for this execution. For a timestamp-based scan, use changes after the checkpoint and through the cutoff, including the cutoff itself. A null checkpoint means there is no previous successful scan, so the source's initial baseline applies.

Use `_dataManager.RunOnStaAsync` with a synchronous callback. Inside it, open either source with `using var geodatabase = _dataManager.OpenFeatureService(BathymetricSource.Constraints);` or select `BathymetricSource.DeconflictedSurveys`. Use ArcGIS feature classes, cursors and rows directly, and dispose them before leaving the callback. Keep async work outside that callback.

Call `_dataManager.ReadBathymetricAoisAsync(cancellationToken)` to read the configured S-128 layer directly. It queries `attributeBindings LIKE '%S-102%'` and returns each non-empty geometry with its full `attributeBindings` string. The geometry uses the service's spatial reference. The detector's Product Manager lookup reads directly from the S-128 geodatabase, and the AOI HTTP endpoint serves WGS84 bounding rectangles.

The injected `bathymetricSurfaceClient` exposes `ReserveAsync` and `CompleteAsync`. The Hangfire job saves completed scan boundaries under `DetectBathymetricSurfaceChangesJob` in `dbo.JobRunState`. Recurring scheduling is disabled.

## API

| Request | Contract |
| --- | --- |
| `GET /Lookup/packagelayers` | Includes `BathymetricSurface` with ID 2. |
| `GET /ElectronicProducts/aoi?layer=BathymetricSurface` | WGS84 bounding rectangles derived from S-128, with `Attributes.BathymetricSurface` for export status, edition and artifact identifiers. The product footprint comes from S-128. |
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
