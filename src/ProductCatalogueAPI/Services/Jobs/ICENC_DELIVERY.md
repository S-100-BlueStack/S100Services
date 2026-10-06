# IC-ENC delivery

Apply `src/ProductCatalogueAPI/Data/Migrations/006_AddProductIcEncDelivery.sql` to the Product Catalogue **System** database before enabling Live mode.

Configure the API and worker with the same `SendToIcEnc` settings. Keep the default `Mode=Simulation` until the receiver confirms the intake paths and directory naming:

| Setting | Meaning |
| --- | --- |
| `Mode` | `Live` sends bytes; `Simulation` never sends bytes. |
| `Host`, `Port`, `Username` | IC-ENC explicit FTPS endpoint. Port defaults to 21. |
| `Password` | FTPS secret. Supply using `SendToIcEnc__Password` or a secret provider. |
| `OperatorKey` | API secret for manual live send and reconciliation. Supply using `SendToIcEnc__OperatorKey` or a secret provider. |
| `S57RemoteRoot`, `S101RemoteRoot` | Existing intake directories, such as `/Upload/S-57` and the IC-ENC supplied S-101 intake path. |

The worker uploads the files inside `ENC_ROOT` or `S100_ROOT` from the stored candidate ZIP to `<remote root>/<dataset>_<edition>_<update:000>/`. Working YAML and `.vld` files are excluded. It refuses to overwrite an existing delivery directory. Confirm this directory convention with IC-ENC before using Live; the legacy S-57 client sometimes used an `ENC_ROOT` destination and a special update name, while the S-101 convention was absent from that client.

POST `/Upload/{datasetName}` with header `X-ICENC-Operator-Key` to queue the ready candidate. Hangfire `/jobs/{id}` reports `AwaitingAcknowledgement` after upload. This is a transfer result, **not** an IC-ENC acceptance. Receipt/acceptance processing is separate.

A transfer failure can occur after bytes have arrived. In this case the track stays `InTransit`, the package shows an error, and `dbo.ProductIcEncDelivery` records `Uncertain`. Find its `delivery_id` by the Hangfire `job_id`, check the remote directory and IC-ENC receipt, then POST `/Upload/deliveries/{deliveryId}/reconcile` with the same header and body `{"receivedByIcEnc":true}` to keep it in transit, or `false` **only after confirming that IC-ENC has no copy** to restore the candidate to Ready. Remove any partial remote directory with IC-ENC before retrying. There is no automatic retry.
