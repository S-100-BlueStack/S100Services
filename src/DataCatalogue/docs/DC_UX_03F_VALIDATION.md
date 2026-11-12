# DC-UX-03F — Package Assignment Details refinement

## Source and scope

- Authoritative baseline: `eaceae8ff8be286c22cd886a05ff14edf3ebce96`.
- Feature owner: `src/features/assignmentPage/ui` and `src/styles/assignment.css`.
- Scope: live Package Assignment Details presentation and the follow-up correction to the native map Retry control's light/dark appearance.
- No backend, API contract, authentication, dependency, package lockfile, map geometry, basemap, draft, Save, or route changes.

## Design and behavior

The live panel retains its existing Package title, saved Pipeline/Workspace bindings, and six ordered metadata fields: Title, Category, Severity, Details, Nautical charts, and Publication. Each term and value remains an HTML `<dt>` / `<dd>` pair in the existing `<dl>`. Compact alternating neutral surfaces and field separators distinguish metadata without adding headings or expanding the panel.

Field titles use bold primary-text styling and a short underline beneath the title text only; the underline does not extend across the row. Values keep a single readable size and normal weight. Styling uses the existing public Calcite-backed `--dc-*` tokens for light/dark mode. The selected Package identity and saved bindings are unchanged.

The Details field continues to render language-specific content through `renderPackageDescriptions`, which sanitizes backend HTML using the existing allowlist. When the **rendered text** exceeds 650 characters, that field alone gains a native closed `<details>` disclosure labeled `Full details`. Opening it reveals the **same already-sanitized nodes**, without reparsing or reinjecting source HTML. Short or absent content is immediately visible and adds no focus stop. Other fields remain visible and never get per-field expand/collapse controls. This is local UI state, not persistence.

Mock Feature assignment retains the existing flat definition list, formatting, content and interaction pattern. Selection loading and errors continue to clear or restore the information panel through its current session lifecycle; no extra requests or subscriptions are introduced.

## Map Retry theme correction (v3 follow-up)

The native `Retry map` button is moved into public ArcGIS `MapView.ui`. That subtree can retain a light `color-scheme` even after DataCatalogue switches to dark mode. The button now explicitly follows `html[data-theme]` for its own color scheme, background, text/icon color and hover surface, using the application's existing light/dark fallback palette. This is scoped to the application-owned control; the MapView, public Calcite icon, Retry callback, UI position, keyboard focus and error handling are unchanged. No private ArcGIS/Calcite selectors or additional theme subscriptions are introduced.

## Automated checks

Run from `src/DataCatalogue`:

```powershell
npm run format
npm run check
```

The targeted Node tests can also be run independently:

```powershell
node --test src/features/assignmentPage/ui/renderInformationFields.test.js src/features/assignmentPage/ui/renderPackageDescriptions.test.js src/features/assignmentPage/ui/renderPackageDescriptions.policy.test.js
```

The targeted tests cover fixed field order and text fallbacks, short vs. long disclosure behavior, mock isolation, and the existing HTML sanitization/URL policy. Full application checks and actual HTML/CSS browser rendering remain local acceptance gates.

## Manual browser acceptance

1. Open Package Assignment in live mode and select a Package with ordinary metadata. Confirm the six field labels are in the previous order, titles are bold with text-only underlines, the existing field separators and alternating neutral backgrounds remain, and no collapse control appears for short Details.
2. Switch between light and dark themes with the details panel visible. Verify muted labels, field backgrounds, borders, text and sanitized description tables remain legible.
3. Select a Package with a long description (over 650 rendered characters) and possibly several languages or a table. Verify `Full details` is collapsed initially; activate with mouse, Enter and Space. The full sanitized description, allowed links and tables must appear without duplicate content or HTML execution.
4. Select a different Package while a long disclosure is open. Confirm the old title, field data and saved bindings clear while loading, with no stale description from the previous selection, then render the new Package.
5. Exercise failed selection + Retry, saved bindings, Pipeline draft toggles, Save/reconciliation and direct Package deep links. Confirm no behavior changes outside the Details presentation.
6. Switch to mock Feature assignment. Confirm its existing flat metadata layout and comments remain unchanged.
7. Test narrow widths and reduced viewport height: scroll only the panel's existing content region, without overflowing the map or hiding field values.
8. On the Assignment map, switch light → dark → light while `Retry map` is visible. Verify that its background, refresh icon and hover state follow each theme immediately, with the same visual size and top-right placement beside Zoom and Basemap Gallery. Activate Retry by mouse and keyboard and confirm one map retry per activation without changing theme or losing focus.

## Deferred / verification limits

A real browser and live backend are required to verify field appearance, screen-reader announcements, long formatted descriptions, theme transitions and ArcGIS UI integration. The map Retry color-scheme fix was checked separately in a Chromium DOM/CSS probe, not in the actual ArcGIS map. The candidate does not add per-field collapses to short metadata, retain disclosure expansion across Package selection, or change backend description content.
