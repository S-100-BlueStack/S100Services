# Product Catalogue — ENC Package Workflow and Frontend Direction

## Status

This document describes the agreed target direction after the September 2026 Product Catalogue demo review.

It is a product/workflow specification, not an API contract and not evidence of the current repository implementation.

The following labels are used throughout this document:

- **Decided**: agreed target behavior.
- **Provisional**: current direction, but expected to change.
- **Open**: not yet decided.

## 1. Scope

The first package type combines S-101 and S-57 into one user-facing work unit.

Other data sources remain simple data sources, but they follow the same high-level automated workflow:

1. Detect source feature changes.
2. Generate/update YAML.
3. Generate candidate exports.
4. Perform internal validation.
5. Schedule automatic delivery.
6. Allow early manual delivery when eligible.
7. Receive external validation results.
8. Require user acknowledgement/Accept where applicable.
9. Commit successful candidates.
10. Archive the completed workflow.

The key difference is that an ENC package contains multiple products that are processed together while retaining independent product results.

## 2. Terminology

### Source feature

The authoritative feature edited by the user before YAML generation.

### Package

A shared workflow unit containing multiple related products.

For the first implementation, the package contains:

- S-101
- S-57

### Product

An individual output inside a package.

Each product retains its own edition, update, status, error information, validation result, export result, IC-ENC result, and committed version history.

### Export candidate

A generated product version that has not yet been committed to the product database.

### Current committed version

The most recently committed product version.

## 3. Package identity and source data

**Decided**

- S-101 determines the package name.
- S-101 determines the shared AOI geometry.
- S-101 determines DisplayScale.
- S-57 and S-101 always share the same geometry and DisplayScale.
- S-101 and S-57 are generated from the same S-101 YAML source.
- S-101 and S-57 edition/update numbers are independent and may diverge over time.
- S-57 currently produces Editions only.
- S-101 Edition versus Update is determined by backend/source/YAML rules and is not selected by the user.

**Provisional**

- The user-facing source/package name is `ENC-package` / `ENC-packages`.
- The final production name is expected to change.

## 4. Package and product status model

**Decided**

A package has a shared workflow status.

Each product retains its own individual status.

The package status and product statuses represent different information and must not overwrite each other.

Example:

- Package: `Awaiting user accept`
- S-101: IC-ENC approved
- S-57: IC-ENC rejected

The package status describes what the workflow is waiting for. Product statuses describe the actual result for each product.

### Filtering

**Decided**

Status filtering operates on both levels:

- package workflow status;
- individual product status.

A package is retained as one result when either the package workflow status or at least one product status matches.

Matching a product must never split the package into separate map/search results.

A package with:

- package status `Awaiting user accept`;
- S-101 approved;
- S-57 rejected;

must therefore be discoverable through all relevant status filters.

The map and popup continue to display the individual product results even when the package has a shared waiting status.

## 5. Automated generation workflow

**Decided**

Users no longer create Edition/Update exports manually from the GUI.

When a source feature changes, the backend is responsible for detecting the change, updating/generating YAML, generating export candidates, and internally validating the generated products.

For ENC packages, S-101 and S-57 run as parallel product tracks within the same package workflow.

The package is not eligible for scheduled or manual sending until the internal processing of all package products has reached a final result.

A final result may be:

- export created and internally valid; or
- product failed generation/validation/export and cannot be sent.

Both products do not need to succeed.

## 6. Internal failures

**Decided**

Failures occurring from YAML processing through internal validation/export require user Accept.

If both products fail internally:

- nothing is sent to IC-ENC;
- the package requires Accept;
- no candidate is committed.

If only one product fails internally:

- the successful product may proceed to IC-ENC;
- the failed product does not proceed;
- the workflow still requires Accept before final completion.

Transmission failures are different from generation/validation/export failures.

**Open**

The final retry/escalation behavior for IC-ENC transmission failures is not decided.

The current direction is that transmission/IT failures should not require ordinary user Accept and may need escalation to a Product Manager or technical operator.

## 7. Delivery scheduling and manual Send

**Decided**

An automatic send timestamp is assigned only after internal processing of the entire package has reached a final result.

Manual Send is also unavailable until the entire package has reached that point.

The send action applies only to products that are eligible to send.

Examples:

- both products valid -> `Send (2)`
- only S-101 valid -> `Send (1)`
- no valid product -> Send is unavailable

Sending is package-scoped even when only a subset of products is sent.

After a package has been sent:

- it is locked;
- it cannot be paused;
- it cannot be discarded;
- a new YAML/export cycle cannot start until the current workflow is complete.

Source feature changes may still occur while the workflow is locked, but they must wait.

### Schedule

**Open**

The final automatic send schedule is not decided.

A shared batch schedule such as two sends per week has been discussed, but no production cadence is agreed.

Frontend must display backend-provided scheduling information and must not calculate the schedule independently.

## 8. Pause and Resume

**Decided**

The actions are named `Pause` and `Resume`.

Pause is available only while a package is waiting to be sent.

Pause blocks:

- automatic Send;
- manual Send.

Pause does not block:

- source change detection;
- YAML generation;
- export generation;
- internal validation.

If a paused package receives a newer source change before sending, its existing candidate may be updated and reprocessed.

That update must:

- preserve Pause;
- preserve the existing planned send timestamp;
- run the necessary generation/validation/export processing;
- remain unsent until Resume.

**Open**

The final scheduling behavior after Resume when the planned timestamp has already passed is not confirmed.

The current direction is to wait for the next common send batch.

## 9. Discard export

**Decided**

`Cancel export` is renamed to `Discard export`.

Discard applies to the whole package.

For an ENC package, both S-101 and S-57 candidates are discarded together.

Discard is available only after export creation/validation and before sending.

Discard is never available after the package has been sent.

Discard must not cause the same source feature revision to be regenerated immediately.

A new workflow may start only when a newer source feature revision exists.

After Discard, the GUI returns to displaying the current committed product attributes and versions.

## 10. IC-ENC results and Accept

**Decided**

All sent product results must be received before the package can be completed.

If every sent product is approved by IC-ENC:

- the backend commits the successful products automatically;
- no user Accept is required.

If at least one product requires acknowledgement because of failure:

- the package enters a shared `Awaiting user accept`-type workflow state;
- individual product results remain visible;
- Accept is required before backend completion.

Accept is not approval of an invalid product.

Accept is the user action that acknowledges the result and releases the backend to complete the workflow.

Example:

- S-101 approved by IC-ENC
- S-57 rejected by IC-ENC

After Accept:

- S-101 is committed;
- S-57 is not committed;
- the package workflow is archived;
- both products return to `Idle` in the active GUI state;
- the failed result remains available in history.

A similar rule applies when one product fails internal processing and another product is later approved externally.

## 11. Source changes while a workflow is open

### Before sending

**Decided**

A newer source change may replace/update the current candidate before sending.

The package must be internally processed again before Send becomes available.

When the package is paused, the special Pause rules in section 8 apply.

### After sending

**Decided**

The active workflow is locked.

A newer source feature revision must wait until:

1. all external responses are received;
2. any required Accept is completed;
3. the previous workflow is closed.

Only then may the newer source revision start a new YAML/export cycle.

A newer source change must never remove the need to Accept an earlier completed failure.

## 12. Popup information architecture

**Decided**

The first implementation focuses on the main map popup.

S-101 and S-57 are displayed side-by-side using the existing product attribute pattern.

The latest candidate is displayed when a candidate exists. Otherwise the current committed version is displayed.

Do not introduce separate permanent `Current` and `Candidate` columns in the first implementation.

Package-level information is placed below the product table so that product information remains immediately visible.

### Product status styling

**Decided**

Only the product status field is initially colored.

Do not color the entire product column in the first implementation.

Do not add status icons to the product table unless a later design decision introduces a stable icon/status mapping.

Color must not be the only status indicator.

## 13. Error presentation

**Decided**

Long error messages must not make the two-column table excessively wide or cause major layout reflow.

The initial field value may simply display `Error` with a dotted underline or another clear affordance.

Hover/focus may expose the error.

The error must also be accessible by click/keyboard.

Clicking the error should open a small anchored overlay/popover above the existing feature popup rather than expanding the product table.

The full error text must be readable and copyable.

**Future option**

If the backend later provides a useful error category/type, the short table text may use that category instead of the generic `Error`.

## 14. Send UI

**Decided**

Use a compact action label: `Send (n)`.

`n` is the number of products that will actually be sent.

Do not permanently list product names next to the button.

The count should expose which products are included through hover/focus and/or the send confirmation.

The confirmation should explain that the action sends to IC-ENC and cannot be undone through the normal package actions after sending.

## 15. Automatic send timestamp UI

**Decided**

The scheduled send time does not need to be permanently displayed as large text.

Use a compact clock-based affordance near the send controls.

Hover/focus should reveal the backend-provided scheduled time.

When paused:

- Send is disabled;
- the schedule affordance should communicate the paused state.

The exact combined clock/pause visual is still a UI implementation detail.

## 16. Accept UI

**Decided**

The common action area may change from Send to `Accept` when user acknowledgement is required.

Accept should expose enough context for the user to understand the result and consequence.

Where backend information permits, the UI should explain which products will be committed and which will not be committed.

Do not describe the unsuccessful product as being "rolled back" when the actual behavior is that its candidate is not committed.

## 17. Map visualization

**Decided**

Map rendering reflects individual product statuses.

When S-101 and S-57 have different relevant statuses, the AOI should use a mixed visual representation.

The first direction is static hatching/striping.

The map only needs to communicate that the package contains mixed product results.

It does not need to encode which stripe/color belongs to S-101 versus S-57; the popup provides that detail.

The implementation must be tested against representative AOI counts/geometries before accepting the rendering approach for production.

## 18. Product Collection

**Decided**

Product Collection treats an ENC package as one work unit.

Selecting or carrying the package through Product Collection must not silently split S-101 and S-57 into unrelated source workflows.

## 19. Analyze, Review and Dashboard

**Decided for sequencing**

These areas are not part of the first implementation phase.

The first phase focuses on the main map/package interaction.

### Analyze and Review

**Direction**

Both S-101 and S-57 must eventually be available because the products have independent histories/results.

The final layout is not decided.

### Dashboard

**Open**

The current thought is that product-level rows may still be useful for history and traceability.

A future package-level view that expands into product-level history may provide better end-to-end traceability.

No final Dashboard model is agreed.

## 20. Frontend demo before backend completion

**Decided**

The first frontend implementation may be a controlled demo while backend contracts are being developed.

The demo should focus on core interaction:

- package popup;
- S-101/S-57 side-by-side attributes;
- package status;
- individual product statuses;
- `Send (n)`;
- `Accept`;
- `Discard export`;
- `Pause` / `Resume`;
- scheduled-send affordance;
- mixed-status AOI hatching;
- package/product status filtering.

Demo actions may update local/demo state to demonstrate state transitions.

Do not build a large demo infrastructure or extensive nice-to-have behavior that will be discarded once the backend is available.

Demo-only operations must not be presented as successful real backend operations.

## 21. Backend capabilities required for live frontend behavior

The frontend may demonstrate the UI before these are complete, but real integration requires backend support.

### Package read model

The backend must expose enough information to identify:

- package identity;
- source identity;
- package workflow status;
- S-101 membership and identity;
- S-57 membership and identity;
- shared geometry/DisplayScale;
- individual product statuses;
- individual product errors;
- candidate/current version information;
- send eligibility;
- products eligible to send;
- Pause state;
- scheduled send time;
- whether Accept is required;
- whether each package action is currently allowed.

The exact DTO/API shape is not defined by this document.

### Package-scoped actions

Live frontend actions require backend support for:

- Pause;
- Resume;
- Discard export;
- Send;
- Accept.

The backend remains authoritative for action validity.

Frontend disabled/enabled states are not sufficient enforcement.

### Workflow concurrency/lifecycle

Backend processing must prevent stale or superseded operations from affecting a newer candidate.

A concrete workflow/generation identity is recommended so that:

- a late IC-ENC response cannot update the wrong candidate;
- an old Accept action cannot complete a newer workflow;
- automatic and manual Send cannot cause duplicate logical delivery.

The exact implementation is not defined here.

## 22. Open decisions

The following items remain explicitly open:

1. Final production name for `ENC-package`.
2. Final automatic send cadence.
3. Resume behavior when the original scheduled timestamp has already passed.
4. Final handling/retry/escalation policy for transmission/IT failures.
5. Exact backend package/read/action API contracts.
6. Final ProductStatus additions and exact status names.
7. Analyze layout for package products.
8. Review layout for package products.
9. Dashboard package/product history model.
10. Final AOI mixed-status symbol implementation after performance testing.
11. Final icon treatment for the scheduled-send paused state.

These items must not be silently inferred during implementation.

## 23. Implementation sequence

### Phase 1 — Main map package prototype

Focus on:

- package-aware map representation;
- S-101/S-57 popup table;
- package information below the product table;
- individual status colors;
- package/product status filtering;
- error details;
- Send/Accept/Discard/Pause/Resume interaction;
- scheduled-send affordance;
- mixed-status AOI hatching.

### Phase 2 — Live backend read integration

Integrate package identity, real product states, candidate/current version data, errors, send eligibility, schedule, and package workflow status.

### Phase 3 — Live package actions

Integrate backend operations for Pause/Resume, Discard export, Send, and Accept.

### Phase 4 — Remaining Product Catalogue surfaces

Address package behavior in Analyze, Review, and Dashboard.

## 24. Repository implementation rule

Before implementation starts, the repository's new authoritative baseline commit and baseline/context files must be selected.

This document defines the intended product/workflow direction.

It does not replace repository source of truth and must not be used to reconstruct or assume the current implementation.
