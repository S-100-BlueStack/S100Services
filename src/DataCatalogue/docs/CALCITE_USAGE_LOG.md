# Calcite Usage Log

DataCatalogue should use Calcite and Calcite Components where they fit the UI need.

This document tracks deliberate decisions to use Calcite, and especially deliberate decisions not to use Calcite where a Calcite component looked applicable.

Normal semantic HTML elements such as `header`, `main`, `section`, `nav`, `div`, `h1` and `p` are not considered Calcite opt-outs. An opt-out means choosing custom/native UI where a relevant Calcite component was considered and rejected.

## Policy

Default:

- Prefer Calcite components for buttons, actions, panels, dropdowns, popovers, forms, notices and other interactive UI.
- Use Product Manager patterns where they are already established.
- Use plain semantic HTML for layout and document structure.
- Log active Calcite opt-outs with the reason and any feedback that may be useful to Esri.

## Current Calcite usage

| Area                    | Calcite usage                                         | Notes                                                                                                        |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Navbar Jobs control     | `calcite-icon`                                        | Used inside a native `button` because `calcite-button` styling did not fit the Product Manager-style navbar. |
| Navbar icon actions     | `calcite-action`                                      | Used for Filters and Test notice.                                                                            |
| Navbar theme toggle     | `calcite-action`                                      | Used for light/dark mode toggle, matching Product Manager navbar action pattern.                             |
| Filters panel-dropdown  | `calcite-popover`                                     | Used because filter UI needs panel-like content, not a short menu list.                                      |
| Filter form controls    | `calcite-checkbox`, `calcite-button`, `calcite-label` | Used for Job filters and Job point clustering settings.                                                      |
| Jobs panel close action | `calcite-action`                                      | Used instead of a native close button.                                                                       |
| Assignment map Retry    | `calcite-icon`                                        | Public refresh icon inside the compact application-owned Retry map button.                                   |

## Active Calcite opt-outs

| Date       | Area                     | Calcite component considered | Decision                                | Reason                                                                                                                                                                                                                     | Esri feedback                                                                                                                                       |
| ---------- | ------------------------ | ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | Navbar Jobs panel toggle | `calcite-button`             | Use native `button` with `calcite-icon` | `calcite-button` worked functionally, but the shadow-DOM button styling and focus outline did not align well with the Product Manager navbar style. A native button gives better control while still using a Calcite icon. | A lightweight navbar/panel-toggle variant for `calcite-button` could be useful for app headers that need Product Manager-style navigation controls. |

## Decision notes

### Filters use `calcite-popover` instead of `calcite-dropdown`

Status: Done

The Filters UI needs room for quick filters at the top and later fuller AOI/Job attribute filters. A short list-style dropdown is too restrictive for that layout.

This is not a Calcite opt-out because the implementation still uses Calcite. The decision is to use `calcite-popover` rather than `calcite-dropdown`.

### DC-001 assignment controls use native form elements

Status: Implemented in the candidate; browser acceptance pending.

Native buttons, selects, the Feature search input, checkboxes, textareas and a modal dialog were selected instead of Calcite form/list/dialog components for the compact assignment page. Application-owned controls allow stable keyed textarea updates, predictable native selection/focus behavior, bounded list replacement and the compact Work stream history affordance without shadow-DOM access. The modal uses native Escape cancellation and focus containment/restoration. Shared theme tokens and `:focus-visible` styling preserve the existing visual/accessibility direction.

The existing Jobs navbar control keeps the established native-button/public-`calcite-icon` pattern. The `Feature assignment` navbar control is intentionally text-only after browser-polish review, so it uses the same application-owned native button without a decorative Calcite icon. The assignment-map Retry action uses the same public `calcite-icon` contract with the `refresh` icon inside a small application-owned native button; this keeps the action keyboard/focus behavior and compact overlay styling under application control without ArcGIS or Calcite shadow-DOM manipulation. The assignment-map legend uses application-owned CSS swatches rather than demo-like glyphs or private Calcite styling.

This is a deliberate page-specific opt-out, not a replacement of existing Jobs/Calcite controls. No private selectors, shadow-DOM manipulation or new component dependency are used.
