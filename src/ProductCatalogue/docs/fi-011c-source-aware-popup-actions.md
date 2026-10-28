# FI-011C Source-aware Popup Actions and Export Menu

Baseline: `60e4854389ab16d3bd280f653998ea10eaa0b6ab`

## Scope

FI-011C makes popup action and Export configuration source-aware without changing backend endpoints
or enabling unsupported Product workflows for mock sources.

## Architecture

1. `productContext.js` resolves a selected Graphic into a central Product context.
2. Registry-backed sources are accepted only when Graphic and layer source metadata agree.
3. Compatibility AOI is admitted through an explicit internal adapter; it is not a registry source.
4. `productActionAvailability.js` combines Product context capabilities with Product status, active
   operations, backend capability state, and popup Export state.
5. `popupExportConfig.js` creates flat Edition/Update descriptors from declarative source
   configuration. Labels, operation kinds, backend targets, and handlers remain separate.
6. `popupExportContract.js` guards direct dispatch. Only the established compatibility Edition flow
   is implemented on this baseline.
7. `popupExportState.js` accepts Product context or source-aware identity while preserving existing
   dataset-name callers and backend-authoritative job visibility.
8. Popup-header Product Collection availability resolves the selected Graphic through the same
   Product context and checks `productCollection`; `supportsPopupActions` only controls whether safe
   popup action-bar content may render.

## Compatibility Export target

The baseline has one real Export operation:

```text
Edition -> POST /export/{datasetName}/newedition/jobs?exportTarget=S100
```

FI-011C presents this as `Export... > Edition` while retaining the S100 wire target. This is not a
combined `All` export and is not an inferred S-57/S-101 split. `Update` remains a disabled placeholder.
Separate source-correct S-57 and S-101 targets require authoritative independent backend Product/read
contracts.

## Mock-source placeholders

Paper Charts and S-102 declare visible `Edition` and `Update` leaves with no handler and no backend
target. The popup renders them disabled with source-specific availability text. No API request,
loading state, download, success notice, error notice, or Product-operation lock can originate from a
placeholder.

## Lifecycle

Source deactivation closes the source popup through the existing controller lifecycle, removes its
layers and derived state, and clears popup-local Export UI state. It does not cancel or delete an
existing backend-authoritative operation. Refreshed Graphics rebuild Product context from current
layer metadata, so stale source actions are not retained across selection or restoration.

## FI-011D deferments

FI-011C intentionally does not enable these mock-source workflows:

- Product Collection;
- Analyze or Review;
- Product History;
- IC-ENC reports;
- internal validation;
- mutations or real Export execution.

These require FI-011D or later source-specific backend contracts.
