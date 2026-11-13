# Application tooltips

`helpTooltip.js` provides one application-owned visual tooltip for compact controls across the Main Map, navbar, Dashboard, Analyze, Review and supporting panels.

`globalHelpTooltips.js` supplies concise control text and delegates hover/focus handling for application-owned controls. It converts authored HTML `title` attributes to `data-app-original-title` to prevent duplicate browser-native help. It observes later `title` updates without replacing the target control or its handlers. The `Last updated` presentation can read this stored text when it needs to restore a previous state.

Popup actions keep their established local session and Escape rules through `popupActionHelp.js`, which now uses the same shared visual tooltip. The popup does not register a second delegated tooltip on `data-popup-help` targets.

Displayed help removes a trailing full stop. Tooltip width follows its content up to a viewport-aware maximum. Mouse help follows the pointer with an offset and flips away from viewport edges; keyboard-visible focus help is anchored to the focused control. For popup action help, mouse-restored focus after a confirmation dialog must not pin help, even when the trigger remains focused. Pointer leave dismisses popup hover help; keyboard-visible focus keeps that help available until blur, Escape, or a change to pointer interaction. Other application controls retain their existing focus-help behavior. The visual tooltip has `pointer-events: none`, so it cannot cover or capture another menu item. Dynamic author-provided detail is retained where removing it would hide meaningful context.

An `aria-label` on a non-interactive table heading or action-row container is only an accessible name, not hover help. Controls still receive delegated help, and authored `title` help (such as Last updated) remains supported. Popup Product-error triggers are excluded from delegated tooltips: their existing selectable error overlay opens on hover/focus and pins on click. Do not create a second tooltip over that overlay.

Do not attach custom tooltips to ArcGIS-owned map chrome or reach into ArcGIS/Calcite shadow DOM. The application-owned popup header actions remain explicitly bound through their existing public host controls. Keep accessible labels, `aria-describedby` relationships, keyboard behavior, Escape, focus and reduced-motion behavior intact.

The separate popup Product-error overlay remains selectable and copyable; it is not a short action tooltip.

## R05 onboarding isolation and self-describing controls (candidate)

During an active Introduction tour, `onboardingUi` marks `document.body` with
`data-pc-onboarding-active` and publishes the application-owned `pc-onboarding-start`
event. Shared help dismisses a visible tooltip and refuses to show another one
while the tour is active. The tour removes the marker during ordinary completion,
Escape, restart and teardown; later pointer or focus interactions can show help
again. No framework shadow DOM is inspected, and accessible control names are
not removed.

Visible Dashboard filters and page-size choices and Review content choices
no longer show redundant hover help. Product names already printed in Dashboard
and Review likewise have no repeated name tooltip. The existing Review checkbox
`aria-label` values, unavailable-action reasons, icon-only action help and the
selectable popup error details remain available.

The reviewed Current-to-Proposed wording is implemented in the R05 v2
candidate: navbar, search, Filters, Dashboard activity/reports, Analyze/Review,
Preferences and ordinary popup action help use shorter labels. Visible Product
option names do not produce redundant hover titles. This change does not
override backend-supplied disabled reasons, remove accessible names or suppress
selectable Product-error details. Local browser acceptance remains pending.
