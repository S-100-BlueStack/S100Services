# Calcite Usage Log

Job Manager should use Calcite and Calcite Components where they fit the UI need.

This document tracks deliberate decisions to use Calcite, and especially deliberate decisions not to use Calcite where a Calcite component looked applicable.

Normal semantic HTML elements such as `header`, `main`, `section`, `nav`, `div`, `h1` and `p` are not considered Calcite opt-outs. An opt-out means choosing custom/native UI where a relevant Calcite component was considered and rejected.

## Policy

Default:

- Prefer Calcite components for buttons, actions, panels, dropdowns, popovers, forms, notices and other interactive UI.
- Use Product Manager patterns where they are already established.
- Use plain semantic HTML for layout and document structure.
- Log active Calcite opt-outs with the reason and any feedback that may be useful to Esri.

## Current Calcite usage

| Area                    | Calcite usage     | Notes                                                                   |
| ----------------------- | ----------------- | ----------------------------------------------------------------------- |
| Navbar Jobs control     | `calcite-button`  | Used so Jobs behaves as a real button rather than a link.               |
| Navbar icon actions     | `calcite-action`  | Used for Filters and Test notice.                                       |
| Filters panel-dropdown  | `calcite-popover` | Used because filter UI needs panel-like content, not a short menu list. |
| Jobs panel close action | `calcite-action`  | Used instead of a native close button.                                  |

## Active Calcite opt-outs

## Active Calcite opt-outs

| Date       | Area                     | Calcite component considered | Decision                                | Reason                                                                                                                                                                                                                     | Esri feedback                                                                                                                                       |
| ---------- | ------------------------ | ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-15 | Navbar Jobs panel toggle | `calcite-button`             | Use native `button` with `calcite-icon` | `calcite-button` worked functionally, but the shadow-DOM button styling and focus outline did not align well with the Product Manager navbar style. A native button gives better control while still using a Calcite icon. | A lightweight navbar/panel-toggle variant for `calcite-button` could be useful for app headers that need Product Manager-style navigation controls. |

## Decision notes

### Filters use `calcite-popover` instead of `calcite-dropdown`

Status: Done

The Filters UI needs room for quick filters at the top and later fuller AOI/Job attribute filters. A short list-style dropdown is too restrictive for that layout.

This is not a Calcite opt-out because the implementation still uses Calcite. The decision is to use `calcite-popover` rather than `calcite-dropdown`.
