# Application tooltips

`helpTooltip.js` provides one application-owned visual tooltip for compact controls across the Main Map, navbar, Dashboard, Analyze, Review and supporting panels.

`globalHelpTooltips.js` supplies concise control text and delegates hover/focus handling for application-owned controls. It converts authored HTML `title` attributes to `data-app-original-title` to prevent duplicate browser-native help. It observes later `title` updates without replacing the target control or its handlers. The `Last updated` presentation can read this stored text when it needs to restore a previous state.

Popup actions keep their established local session and Escape rules through `popupActionHelp.js`, which now uses the same shared visual tooltip. The popup does not register a second delegated tooltip on `data-popup-help` targets.

Displayed help removes a trailing full stop. Tooltip width follows its content up to a viewport-aware maximum. Mouse help follows the pointer with an offset and flips away from viewport edges; keyboard focus help is anchored to the focused control. The visual tooltip has `pointer-events: none`, so it cannot cover or capture another menu item. Dynamic author-provided detail is retained where removing it would hide meaningful context.

An `aria-label` on a non-interactive table heading or action-row container is only an accessible name, not hover help. Controls still receive delegated help, and authored `title` help (such as Last updated) remains supported. Popup Product-error triggers are excluded from delegated tooltips: their existing selectable error overlay opens on hover/focus and pins on click. Do not create a second tooltip over that overlay.

Do not attach custom tooltips to ArcGIS-owned map chrome or reach into ArcGIS/Calcite shadow DOM. The application-owned popup header actions remain explicitly bound through their existing public host controls. Keep accessible labels, `aria-describedby` relationships, keyboard behavior, Escape, focus and reduced-motion behavior intact.

The separate popup Product-error overlay remains selectable and copyable; it is not a short action tooltip.
