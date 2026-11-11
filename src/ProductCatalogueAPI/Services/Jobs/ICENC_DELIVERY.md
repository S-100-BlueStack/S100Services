# IC-ENC delivery

Apply `src/ProductCatalogueAPI/Data/Migrations/006_AddProductIcEncDelivery.sql` to the Product Catalogue **System** database before enabling Live mode.
Then apply `src/ProductCatalogueAPI/Data/Migrations/007_AddIcEncAcknowledgements.sql` before deploying the acknowledgement service and worker. Neither migration runs automatically.

Configure the API and worker with the same `SendToIcEnc` settings. Use `Mode=Simulation` until the receiver confirms the intake paths and directory naming:

| Setting | Meaning |
| --- | --- |
| `Mode` | `Live` sends bytes; `Simulation` never sends bytes. |
| `Host`, `Port`, `Username` | IC-ENC explicit FTPS endpoint. Port defaults to 21. |
| `Password` | FTPS secret. Supply using `SendToIcEnc__Password` or a secret provider. |
| `OperatorKey` | API secret for manual live send and reconciliation. Supply using `SendToIcEnc__OperatorKey` or a secret provider. |
| `S57RemoteRoot`, `S101RemoteRoot` | Existing intake directories, such as `/Upload/S-57` and the IC-ENC supplied S-101 intake path. |

The worker uploads the files inside `ENC_ROOT` or `S100_ROOT` from the stored candidate ZIP to `<remote root>/<dataset>_<edition>_<update:000>/`. Working YAML and `.vld` files are excluded. It refuses to overwrite an existing delivery directory. Confirm this directory convention with IC-ENC before using Live; the legacy S-57 client sometimes used an `ENC_ROOT` destination and a special update name, while the S-101 convention was absent from that client.

POST `/Upload/{datasetName}` with header `X-ICENC-Operator-Key` to queue the ready candidate. Hangfire `/jobs/{id}` reports `AwaitingAcknowledgement` after upload. This is a transfer result, **not** an IC-ENC acceptance. Receipt/acceptance processing is separate.

## Acknowledgements and publication

The shared-mailbox adapter uses `ValidationEmail:Mode=Live`, exact outgoing file manifests and `IIcEncAcknowledgementService.RecordAsync`. It authenticates and parses notices before applying an exact delivered revision; uncertain, stale, ambiguous and conflicting results require review. Registration is receipt only, and conditional holding never finalizes acceptance. Apply migration 011 before deploying the adapter or its outgoing manifest capture. See `../ValidationEmail/DEPLOYMENT.txt` for setup, rollout, audit/review APIs and recovery. The former MailImport/Graph scaffolding is removed.

The Swagger fallback is `POST /Upload/acknowledgements` with header `X-ICENC-Operator-Key` and body `{"datasetName":"101DK001...","productSpecification":"S101","edition":1,"update":0,"decision":"Accepted","noticeReference":"<IC-ENC notice identifier>"}`. Use `Rejected` and an optional `reason` for a rejected product. If versions are ambiguous, supply the optional `deliveryId` obtained from the System database after verifying the IC-ENC notice. This endpoint calls the same service with `Source=Manual`; the caller cannot impersonate the email source. Simulation cannot apply an acknowledgement. A rejected track retains its candidate and shows `Error` and the notice reason on its ENC package, allowing an operator to discard it or wait for new source edits to rebuild it.

The first acceptance leaves its track `AcceptedForDistribution` and the package locked. The second acceptance queues the worker-only `FinalizeEncPackageJob`. A package with a discarded candidate is not published through this pair-finalization path.

Finalization loads the package's shared source YAML, the two exact accepted versions and the S-101 compiler index/signature. One S-128 geodatabase edit transaction updates both ElectronicProduct surface bindings and writes a single S-101 `Dataset` attachment. Its `data` is a ZIP containing the shared `yaml`, `index` and `sign` entries expected by `GetLatestDatasetYAML`; the attachment metadata includes `PackageId` for idempotent recovery. A subsequent System database transaction updates both published versions, clears both candidates to `Idle`, appends `Published` and `Idle` history, records the replay bound for edits made during transit, and deletes the active package.

If the worker stops after S-128 commits but before SQL completes, the package stays pending. A retry detects its `PackageId` attachment and verifies both S-128 versions before committing SQL, without inserting a second attachment. The DPC scan finds and retries pending accepted packages even if the immediate Hangfire enqueue failed. If S-128 contains conflicting versions or an attachment without matching surface data, publication stops for manual repair; it never silently overwrites those records. Operations in the System database and S-128 cannot share one atomic transaction.

Windows SSO and the distribute policy protect the acknowledgement/review APIs; the existing operator key is additionally required for live manual acknowledgement and reviewed association. Keep that key in a secret provider. The existing finalizer uses a host file lock and one Hangfire worker; multiple hosts still require the existing finalization constraints to be addressed before rollout.

With both `SendToIcEnc:Mode=Simulation` and `ValidationEmail:Mode=Simulation`, each successful simulated send captures a random sample-shaped response for its exact candidate. The normal parser/matcher processes it into a permanently synthetic preview. Repeated job IDs reuse the same result. `POST /upload/icenc-emails/simulate` can explicitly roll another response with a new request GUID. Simulation has no Graph credential requirement and cannot acknowledge, mutate candidates or publish to S-128. It remains distinct from Live plus DryRun, which reads real emails but previews their decisions.

A transfer failure can occur after bytes have arrived. In this case the track stays `InTransit`, the package shows an error, and `dbo.ProductIcEncDelivery` records `Uncertain`. Find its `delivery_id` by the Hangfire `job_id`, check the remote directory and IC-ENC receipt, then POST `/Upload/deliveries/{deliveryId}/reconcile` with the same header and body `{"receivedByIcEnc":true}` to keep it in transit, or `false` **only after confirming that IC-ENC has no copy** to restore the candidate to Ready. Remove any partial remote directory with IC-ENC before retrying. There is no automatic retry.
