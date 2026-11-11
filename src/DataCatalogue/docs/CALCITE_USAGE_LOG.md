## DC-SDK-01 v6 — Restore Esri Basemap Gallery (candidate, 2026-11-11)

The screenshot review of v5 confirmed that imitating the original Esri Basemap
Gallery with native Calcite List/Card controls does not preserve the expected
standard design. The v3-v5 selector replacements are superseded by the actual
public `arcgis-expand` and `arcgis-basemap-gallery` components attached to the
existing `MapView` via their documented `view` properties. `LocalBasemapsSource`
now comes from `@arcgis/core/basemapGallery/LocalBasemapsSource.js`, the supported
5.2 path. The components must be defined before their `source` and `view`
properties are assigned, and are explicitly destroyed when detached.

No Calcite shadow-DOM styling or hand-authored replacement gallery is used.
The gallery's internal layout, thumbnails, selection presentation and keyboard
handling remain owned by Esri. The validation of an optional protected basemap
runs outside MapView startup so an invalid API key cannot block the map.
Real 5.2.1 component rendering is pending browser acceptance; the original
`null.state` error was not reproducible in the SDK-independent test runtime.

---

## DC-SDK-01 v5 — Basemap thumbnail rows (2026-11-11)

User browser feedback on v4 confirmed that `calcite-card` laid out thumbnails
as narrow strips and used a two-column grid unlike the former ArcGIS gallery.
The current selector uses the public `calcite-list` and `calcite-list-item`
(`selectionMode="single-persist"`, `selectionAppearance="highlight"`,
`calciteListChange`, and the `content-start` slot). Each row has a fixed-size
112 x 64 px preview to the left of its label. The panel scrolls vertically.
The colors use documented `--calcite-list-*` variables and existing `--dc-*`
tokens, without shadow-root styling. This supersedes the v4 Card visual
implementation, not the shared basemap-settings service or the operator
migration. Browser verification on Calcite 5.2.1 is still required.

---

## DC-SDK-01 — Basemap selector native control (2026-11-11)

The earlier decision to use public `arcgis-expand` and `arcgis-basemap-gallery`
for DataCatalogue's basemap selector is superseded after browser testing on
ArcGIS 5.2.1 showed a Gallery rendering exception (`null.state`) and an empty
panel. The precise SDK/component root cause has not been independently proven.

The replacement uses an application-owned native button and radio group with
the public `calcite-icon` (`basemap`). Its state is owned by the existing
`basemapSettings` service, and its host stays in public `MapView.ui`. This
avoids both the crashing Gallery lifecycle and private Calcite/ArcGIS DOM
access while preserving light/dark tokens, Escape, focus, and map synchronization.
No new dependency or migration to `arcgis-map` is required.

See [DC_SDK_01_BASEMAP_FOLLOWUP.md](DC_SDK_01_BASEMAP_FOLLOWUP.md).

---

## DC-SDK-01 — Calcite 5.2 public component migration (2026-11-10)

- Keep `calcite-action-bar` with public `expandToggleDisabled = true` and
  `overflowMode = "none"`. They replace the 5.2-deprecated `expandDisabled`
  and `overflowActionsDisabled` properties without changing the docked layout.
- Rely on the browser's `color-scheme` property for Calcite light/dark styling.
  Application CSS continues to use its own `data-theme` selector for targeted
  light/dark variations. No private Calcite internals are touched.
- Continue using `arcgis-expand` and `arcgis-basemap-gallery` with public
  `view`/`source` APIs and Esri's documented `LocalBasemapsSource`. There is no
  legacy BasemapGallery widget instantiated in DataCatalogue.
- Existing application-owned native controls remain intentional opt-outs, as
  documented in the earlier entries. The old Calcite foreground/background
  tokens require a separate visual review before removing their compatibility
  aliases for 6.0.

---

## DC-UX-02 — Preferences controls and navbar parity (2026-11-09)

The application-owned Preferences panel now uses the public `calcite-switch`
component for the theme toggle and independent Auto-save choices. `checked`,
`label`, `calciteSwitchChange` and `setFocus` are public component contracts;
`main.js` registers the component before navbar initialization completes.
Light/dark theme and storage logic remain in DataCatalogue's existing services.

The panel container, group headings, close button, basemap reset action and
popover placement remain application-owned native DOM/CSS. This is intentional:
ProductCatalogue's Preferences surface is a non-modal floating panel, while
DataCatalogue requires its own persistence options and focus/dismissal
lifecycle. CSS uses semantic `--dc-*` and documented `--calcite-*` colors, not
private Calcite selectors or a copied ProductCatalogue stylesheet.

---

## DC-UX-01 v4 — Map UI ownership and icon emphasis (2026-11-06)

The application retains public Calcite `save`, `refresh` and `speech-bubble`
icons in application-owned native buttons (keyboard and accessible names remain
native). The Save icon uses a larger public icon scale and brand-color state only
when the existing draft/session validation permits Save; the binding comment
icon is slightly larger and keeps its anchored native editor.

For maps, `view.ui.add(host, { position: "top-right", index: 1 })` registers the
existing public `arcgis-expand` basemap component beneath native Zoom, with
assignment Retry at index 2. Controls use public `visualScale = "m"`,
application-owned 32px host dimensions and shared light/dark surface/shadow.
This avoids absolute offsets, deprecated Expand widgets, and shadow-DOM hacks.

---

## DC-UX-01 v3 — Compact icon actions, nested Workspaces and map controls (2026-11-06)

- The Pipeline comment trigger uses Calcite `speech-bubble` via a native
  icon-only button to avoid visually heavy button chrome and retain native
  keyboard focus, click and title semantics. The anchored text editor uses a
  native textarea and close button, not private Calcite popover shadow DOM.
- Live Workspace checkboxes are nested directly in the Pipeline row, matching
  the main-map Pipeline hierarchy. Automatic reads are scoped to selected
  Pipelines. Native labels/checkboxes preserve keyboard input and don't require
  a Calcite accordion or private selectors.
- Package-list Refresh, Pipeline Save and mounted main Packages Refresh use
  native buttons styled as icon-only controls with public Calcite icons and
  `aria-label`/`title`, to preserve stable element identity across updates.
- Main and assignment maps move ArcGIS zoom via public `MapView.ui.move` to
  `top-right`. Basemap actions use the public `arcgis-expand.visualScale = "m"`
  property (available from ArcGIS 5.0). CSS aligns the app-owned overlay hosts;
  no ArcGIS/Calcite internal shadow DOM is accessed. Real browser size alignment
  remains a manual QA check.
- Navbar route links are native links, retaining actual navigation semantics.
  The full-height active underline and reduced-motion guard are adapted from
  ProductCatalogue's header styles, not a custom Calcite navigation element.

---

## DC-UX-01 v2 — Workspace override preview editor (2026-11-06)

The compact Pipeline row uses native checkbox and expand/collapse buttons for
Workspace choice preview. This preserves existing keyboard/tab/focus behavior
without relying on Calcite shadow-DOM internals. The Workspace catalogue is
loaded on demand per Pipeline, and state is owned by the assignment session.
Blue selection/outline tokens use public `--calcite-*` properties. Browser
verification of light/dark and keyboard behavior remains required.

---

## DC-API-06 Package geometry visualization (2026-11-05)

The assignment-map geometry legend uses the existing application-owned,
non-interactive semantic markup and CSS swatches to distinguish Package AOI,
detailed Features and saved Workspace coverage. A Calcite interactive control
is not needed for a static legend. Map graphics use public ArcGIS GraphicsLayer
and geometry APIs; there is no private Calcite/ArcGIS shadow-DOM manipulation.

---

## DC-API-05 — Compact Jobs controls

Live Job Details uses a public `calcite-action` with the `refresh` icon, accessible
`text` and title instead of another full-width button. Live cards keep the existing
public Calcite detail action and status buttons. Native semantic headings, fact lists
and compact contextual text are intentional application-owned presentation, not new
custom replacements for Calcite controls. Mock Job actions are preserved; no private
shadow-DOM selectors or undocumented properties are introduced.

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

### DC-API-05 v2 — Jobs refresh icon controls (2026-10-30)

- Use an application-owned native icon-only button containing public `calcite-icon`
  (`refresh`) for Jobs list, Job Details and missing-Job retry. A standalone
  `calcite-action` can display its `text` in some contexts, while a text-only
  `calcite-button` was still rendered in the Jobs list.
- Provide native `title`, `aria-label`, `:focus-visible` styling and disabled
  state without private Calcite selectors or altering refresh behavior.

### DC-STAB-02D — Native recovery actions and public keyboard focus (candidate, 2026-11-04)

The assignment toolbar adds application-owned native `button` controls for
read-only binding verification and explicit local draft discard, consistent with
its existing native Save control. Jobs uses stable `data-job-focus` markers on
public `calcite-button`/`calcite-action` hosts and native Refresh buttons to
restore logical keyboard focus after re-rendering. There are no private Calcite
shadow-DOM selectors, new component dependencies, or changes to theme tokens.

### DC-UX-01 — Persistent header Refresh and compact assignment controls (2026-11-06)

The Packages header uses an application-owned native icon-only `button` with a
public `calcite-icon`, `aria-label`, disabled/loading state and
`:focus-visible`, rather than manipulating a Calcite action's shadow root. The
Done/No update toggles continue using public `calcite-button` `kind`,
`appearance` and `aria-pressed` attributes. Package assignment keeps native
form inputs and structural CSS for precise desktop layout; no private
Calcite internals or new components are introduced. The permanent Pipeline
reload control is replaced by an accessible error-only Retry action.
