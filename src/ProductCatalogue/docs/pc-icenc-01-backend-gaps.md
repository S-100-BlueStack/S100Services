# PC-ICENC-01 - Backend and frontend integration gaps

## Verified scope

- **Feature commit:** `6365ab36855b2f88b1440f73759919d48ca2933f`.
- **Integrated baseline:** `17ff86537bd7041cb1a025d113862898e1814046`.
- **Follow-up changes reviewed:** `cf814cf1db195df716a41447230405323ed8d016`,
  `f220b0cc54dac628a4ab439e48edb5d96c6f27f3`,
  `946013f6aab38b8fd8cd941afb1c7da8f0774bb4`.
  The provided filtered patch does not expose the changes, if any, in `f220b0cc`.
- The reviewed feature is named `Accept simulated ENC sends and acknowledge failed packages`.
- `CanAcknowledge` and `POST /electronicproducts/packages/{sourceName}/acknowledge`
  are supported by the backend source. The operator-facing **Accept** uses that
  Acknowledge endpoint; it does not generate or change the IC-ENC provider verdict.
  The backend transaction currently retires both candidate tracks to `Idle`,
  preserves recorded provider verdicts and leaves prior published editions
  unchanged; it does not publish the accepted sibling in a mixed pair.
- The normal paired `Send` action processes generated acceptance reports only when
  **both** send and validation-email modes are Simulation. The client does not
  enable this through a Vite setting.
- Mailbox ingestion, sender trust, parsing, exact delivery matching and operator
  audit/review have server-side source code. Live rollout, real mailbox processing
  and production data were not verified by this frontend task.

## Implemented in this candidate

- Active ENC Package popups on Main Map and Analyze show **Accept** in the
  existing Send/Accept slot when `CanAcknowledge: true`; they never render an
  additional Acknowledge control.
- Accept requires confirmation, exact active Package ID, a live session and
  a server-confirmed response with the same identity and `Idle` status.
- All other Products, missing permissions and detached sessions remain closed.
- Successful acceptance of the received outcomes triggers existing Product/source
  refresh paths; no synthetic status or provider decision is introduced.
- **Updated backend eligibility:** Commit `946013f6` restricts
  `CanAcknowledge` to an exact safe pair with at least one current member in
  `Rejected`. A failed internal SevenCs validation or outbound send does not
  grant Accept. The frontend must not duplicate these backend eligibility rules.
- **Confirmed backend behavior gap:** The current Acknowledge SQL retires both
  candidates and preserves each member's prior published edition/update. The
  intended mixed outcome (publish the accepted sibling while separately handling
  the rejected member) is **not implemented by this endpoint** and remains a
  backend-owned decision. Do not claim that pressing Accept publishes one member.
- **Accepted pair finalization:** Commit `946013f6` attempts synchronous
  Worker finalization after both members are accepted. If it fails, recovery
  is queued or retried by DPC. This path is separate from operator Accept.

## Outstanding contracts, in priority order

1. **Product-scoped IC-ENC report provenance:** The current
   `GET /electronicproducts/{name}/artifacts/history` returns artifact ID,
   track/revision, Product specification, generic `Kind`, filename and URL.
   The IC-ENC inbound repository stores source metadata internally, but this
   provenance is **not present** in the response. Do not classify reports by
   filename or guess whether `ValidationReport` means internal or external.
   Expose a server-owned report source/type and bounded per-Product/revision
   association before showing actual IC-ENC report downloads in Analyze,
   Review or Dashboard.
2. **External validation status/history:** Provide an authorized,
   Product-scoped read model for matching delivered revisions to received,
   accepted, rejected or review-required notices, including processing time,
   current/past distinction, durable identifiers and report artifacts. The
   global `/upload/validation-emails` audit endpoint is limited to the latest
   100 rows and is not a replacement for Product-specific history.
3. **Operator review without exposing secrets:** The current review endpoint
   requires `X-ICENC-Operator-Key` as well as the distribution policy. A GUI
   needs a dedicated server-controlled authorization and CSRF/audit design;
   never place the operator key into frontend source, browser storage or `VITE_`
   environment variables. Untrusted or ambiguous reports must remain under
   explicit review and may not be accepted automatically by frontend code.
4. **Live Send and deployment configuration:** The existing package `CanSend`
   is simulation-only. A production Send/receive flow, rollout barrier, worker
   permissions, applied SQL migrations and distributed finalization guarantees
   must be verified with the backend owner before the UI implies that it can
   transmit to IC-ENC. Running paired simulation mutates workflow state and
   potentially invokes normal publication; use only approved test data.

## Local verification

- With an eligible failed S-101/S-57 package, confirm `CanAcknowledge`
  changes the existing Send control to Accept (four controls including Tools on
  Main Map, three without Tools on Analyze). No extra button should appear.
  Cancel once; confirm once; verify exactly one POST with the active Package ID.
- Confirm the backend returns aggregate Idle, both current candidates are
  retired without modifying published editions, provider decisions remain in
  history, and Product/source refresh is triggered. For a mixed Accepted/Rejected
  pair, explicitly check that the accepted candidate was **not** published.
- Test 409 conflict, failed API requests, permission removal, an unmounted
  popup, a second Product selection and leaving Analyze during confirmation.
- Confirm the slot remains Send when `CanAcknowledge` is false, including
  internal SevenCs `Error` and failed Send without provider rejection. Ordinary
  Products cannot dispatch Accept. Check Light/Dark, tooltip, focus and Escape.
- Simulated Send acceptance and genuine mailbox processing require a separate
  integration run with the correct SQL migrations, server modes and worker.

No backend project, migration, authentication, application configuration or
package dependency is modified by this frontend candidate.
