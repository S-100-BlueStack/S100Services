## DC-API-04 v3 — docked Shell pattern

- Main map now uses public `calcite-shell` and `calcite-shell-panel` with `displayMode="dock"`
  and `contentBehind=false`; the `calcite-action-bar` lives in the documented `action-bar`
  slot. A single `calcite-panel` hosts either the Pipeline visibility panel or Jobs panel.
  This replaces positioning the action bar and content as absolute overlays over the map.
- Native input checkboxes and select controls remain intentional application-owned controls
  inside public Calcite layout components. They provide direct keyboard interaction without
  relying on private shadow-DOM styling. Light/dark follows app tokens, and map navigation
  uses `animate: false` for explicit focus actions.

# Calcite Usage Log

## DC-API-04 correction — docked Calcite Action Bar (2026-10-29)

- The main map uses the public `calcite-action-bar` and `calcite-action` components to expose
  icon-only `Jobs` and `Pipelines` actions on the left edge. These are map operations, not
  links between separate pages. `text` remains the accessible label for each action.
- `Package assignment` uses an ordinary semantic `<a>` element in the header because it is
  a separate routed page, not a map action. This is not a Calcite form control opt-out.
- The Pipeline checklist uses native checkboxes and labels in an application-owned side
  panel. This keeps multi-toggle keyboard input compact and avoids private Calcite DOM.
  The panel follows application light/dark tokens and `:focus-visible`.
- The previous native `Jobs` _navbar_ button and selected-Workspace `Focus Workspace`
  discussion below are historical for the original prototype; they are superseded in live
  mode by this correction. The assignment page retains its independent Focus Workspaces
  control and map Retry action.
- No Calcite private shadow-DOM selectors or unsupported custom properties are introduced.

## DC-API-04 map focus controls (2026-10-29)

The native `Focus Workspace` and `Focus Workspaces` buttons extend the accepted compact native
Workspace/assignment control pattern. They preserve ordinary keyboard focus, stable control
identity and the existing `:focus-visible` styling. The map Retry action retains its public
Calcite icon. No shadow-DOM styling, custom map widget framework or new dependency is used.

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

## DC-API compact live controls (2026-10-28)

Status: Implemented candidate; browser acceptance pending.

Pipeline assignment uses the existing native checkbox/label pattern and keyed rows to retain
keyboard focus and one-click behavior. The Workspace/Pipeline selector uses a native select
with optgroups, plus native Reload Workspaces and Reset mock statuses buttons. These choices
extend the existing compact application-owned form pattern rather than introducing a second
component lifecycle. Public Calcite status/buttons/icons remain in the Jobs UI. Shared theme
tokens, small borders and `:focus-visible` style the new controls; no private shadow-DOM access
or new animation is introduced. No live map control is offered for unverified geometry.

### DC-API-04 v4 — docked action bar, floating panels and ArcGIS Basemap Gallery

- Use documented `calcite-shell-panel display-mode="float-content"` to keep the action
  bar docked while floating only the active `calcite-panel` over the existing MapView.
- Use public ArcGIS map components `arcgis-expand` + `arcgis-basemap-gallery`, both
  bound to programmatic MapView with their public `view` property. This avoids
  deprecated `@arcgis/core/widgets/BasemapGallery` and avoids migrating to `arcgis-map`.
- Use the documented `calcite-popover` for the compact Preferences panel, and
  application-owned native select/checkbox inputs rather than private Calcite DOM.
- No private shadow-root selectors or programmatic shadow-DOM manipulation are used.

### DC-API-04 v5 — verified layout and Preferences opt-outs (2026-10-30)

- **Action Bar:** keep public `calcite-action-bar` and `calcite-action`, but position
  the bar in an application-owned fixed-width grid column. The earlier public
  `calcite-shell-panel display-mode="float-content"` still shifted the map in
  local browser tests. The mutually exclusive Jobs/Pipelines content is a native
  floating panel host to guarantee MapView size stability. No private selectors.
- **Preferences:** use an application-owned non-modal panel with native theme select
  and persistence checkboxes, triggered by a public Calcite Action. In local testing
  the v4 Calcite Popover did not become visible. The replacement preserves Escape,
  outside-click dismissal, focus restoration, `aria-expanded` and light/dark tokens.
  No direct component shadow-DOM access or new UI library is introduced.
- **Basemaps:** retain `arcgis-expand` + `arcgis-basemap-gallery` with their documented
  public `view` and `activeBasemap` properties. All four available basemaps appear in
  either theme. Theme only controls automatic defaults, not gallery availability.

### DC-API-04 v6 — neutral Action Bar colors (2026-10-30)

- Keep the existing docked `calcite-action-bar` layout and floating application-owned panel behavior.
- Use public `--calcite-action-bar-background-color` and `--calcite-action-*` CSS properties with semantic `--calcite-color-surface-2/3/4` and `--calcite-color-text-1/2` tokens. The neutral colors follow Calcite light/dark mode without requiring separate hard-coded values.
- Apply the neutral surface to the Action Bar host as well as the component tokens, so the entire 48px map toolbar does not reveal the blue-tinted map background between actions. No shadow-DOM selectors or changes to focus behavior are introduced.
