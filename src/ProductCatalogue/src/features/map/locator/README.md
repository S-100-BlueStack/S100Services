# Main-map geographic Locator

FI-012 adds a geographic Locator beside the existing Main-map Product search. The two workflows are
intentionally separate:

- Product search resolves loaded, active Product graphics and opens the existing Product popup.
- Locator searches geographic addresses and places and only navigates the existing `MapView`.

Locator results never enter Product selection, popup, hover, filter, Product Collection, data-source,
or Product-operation flows.

## Service and configuration

The Locator service is configured through `VITE_ARCGIS_LOCATOR_URL`. Development and production
configuration currently point to the ArcGIS World Geocoding Service:

```text
https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer
```

FI-012 intentionally adds no API key, OAuth flow, hardcoded token, secret configuration, or Windows
credential forwarding. Authentication changes, if deployment later requires them, belong to a
separate runtime/configuration change.

Missing, blank, malformed, non-HTTP(S), credential-bearing, query-bearing, or non-GeocodeServer
configuration fails closed. The Locator action remains unavailable and no ArcGIS default source is
allowed to take over.

## Logical Places source

`locatorSourceRegistry.js` owns the logical source contract. FI-012 exposes exactly one initial
user-facing ArcGIS Search source:

```text
Places
```

`Places` is backed by the configured ArcGIS World Geocoder. Denmark and Greenland are implementation
scope inside that source rather than separate Search sources, so the user sees one normal suggestion
and result list instead of country source selectors or country-grouped results.

The World Geocoder request scope is intentionally strict:

```text
sourceCountry=DNK,GRL
category=Address,Postal,Populated Place
```

`locatorWorldGeocoder.js` builds this same scope into both `/suggest` and
`/findAddressCandidates` requests. The Faroe Islands (`FRO`) are not included and there is no
unrestricted worldwide request. General business and POI discovery is outside FI-012.

The registry retains a fallback zoom scale for point results. Geocoder result extents remain preferred
when available; the Locator lifecycle applies the fallback only when Search asks to navigate to a
point target without an extent.

## ArcGIS Search component and custom SearchSource

`locatorSearchSources.js` materializes the `Places` registry entry as an ArcGIS generic
`SearchSource`. The source implements the documented `getSuggestions` and `getResults` callbacks and
uses `esriRequest` for the World Geocoder calls. The Search callback abort signal is passed through to
`esriRequest`, so ArcGIS Search cancellation can propagate to the underlying request.

`mainMapLocator.js` receives only prepared Search sources, Search behavior configuration, and generic
navigation options. It contains no Denmark/Greenland request branching.

The controller creates `arcgis-search` from `@arcgis/map-components`, connects it to the existing
`MapView` through the component `view` property, and configures the single explicit source with:

- `includeDefaultSourcesDisabled: true`;
- `activeSourceIndex: 0`;
- `searchAllDisabled: true`;
- `autoSelectDisabled: false`;
- `autoNavigateDisabled: false` while the Locator session is active;
- `popupDisabled: true`;
- `resultGraphicDisabled: true`.

With one logical source, ArcGIS has no current country source selection/grouping to expose. Enter uses
Search's native first-result auto-selection and navigation. The custom source distinguishes a real
selected World Geocoder suggestion by its service `magicKey`. An explicit suggestion is resolved as-is.
When Enter is pressed on raw free text, the source resolves the first current keyed World Geocoder
suggestion for that exact term; if suggestions are still loading, it performs a scoped suggestion
lookup using the Search callback abort signal and then resolves the first keyed result. Only when no
valid suggestion exists does it fall back to a scoped direct candidate lookup. Suggestion state is
generation-guarded so a late response for an older term cannot replace the current Enter fallback.
Every path calls the World Geocoder with the same `sourceCountry=DNK,GRL` and category scope. Mouse
selection of an explicit second or later suggestion retains priority and remains native Search behavior.

FI-012 does not create a Locator popup, result marker, retained result Graphic, or parallel search UI.
The custom source creates transient ArcGIS `Graphic` objects only as the documented SearchResult
geometry contract; `resultGraphicDisabled` prevents them from being drawn or retained as map result
markers.

## Main-map layout and lifecycle

`mainMapSearchControls.js` is the neutral layout boundary for the two sibling controls. It owns
placement, positioning, slots, and the compact inline open/closed layout. The same neutral boundary
owns the decorative open/close transition: the Locator slot remains present while its `flex-basis`
collapses so the action can slide back with the field instead of jumping when Search is removed. The
layout marks this interval as `closing` and finalizes `closed` on the slot's `transitionend`. A newer
open state invalidates any older close completion, and reduced-motion users skip directly to the final
closed layout. The Locator action remains a square Calcite action, centers its icon through the public
`alignment="center"` contract, and leaves Calcite Action's native internal layout untouched. Application
CSS owns only the external 32x32 footprint and visuals. The visual border is an inset shadow rather than
a real host border, and the component uses Calcite's documented action styling tokens for light/dark
background, hover/press color, text color, and angular corner treatment:

```text
closed: Product search | Locator action
open:   Product search | Locator search | Locator action
```

Product search still owns Product indexing, suggestions, Product navigation, selected-Product
behavior, and popup opening. Locator still owns geographic Search component lifecycle and geographic
sources. The layout receives only a neutral Locator open-state flag. It does not import either feature
implementation.

The app composition layer injects Product search's public `close()` boundary when Locator opens so an
open Product suggestion list can close without clearing the Product query or coupling Locator to
Product-search internals.

Each Locator open creates a fresh `arcgis-search` session. Closing the Locator first marks that
session inactive, then sets `autoNavigateDisabled = true`, calls the component's documented `clear()`
method, resets source-local transient suggestion state, removes the component from the surface, and
destroys that component instance before publishing the visual closed state. A later response belonging
to the retired instance therefore cannot navigate even if the neutral shell is still collapsing or a
new Locator session has already been opened. The empty surface container may remain during the short
CSS collapse solely to preserve layout geometry; it contains no active Search component or provider
session. `clear()` is used to clear the term, suggestions, results, result graphics, and menus; FI-012
does not assume that `clear()` itself cancels an in-flight network request.

ArcGIS Search exposes `searchTerm` as writable state, but `results` and `suggestions` are readonly and
`clear()` is the supported public API that retires the completed Search UI. There is no supported
result-only cleanup contract that preserves the text while clearing both readonly result collections.
To avoid displaying completed Search A results under a later query, FI-012 therefore uses a deliberate
clear-after-navigation fallback: after the selected result's `view.goTo()` has completed successfully,
the current Search UI is cleared while the Locator remains open and the new map viewpoint is preserved.
The cleanup is scheduled after the navigation promise so it cannot prevent the current selection from
entering the native Search navigation lifecycle. Locator stays expanded and ready for the next query;
the selected map viewpoint is not restored or otherwise changed by `clear()`.

The same successful-navigation cleanup resets the custom source's application-owned suggestion cache.
The reset increments its generation before dropping the cached term and suggestions, so a late provider
response from the completed search cannot repopulate that state. Starting a newer term already has its
own exact-term/generation guard, so Search B cannot consume Search A's first keyed suggestion.

The documented Search `goToOverride` hook remains the final stale-navigation gate. While the current
Locator session is open it delegates Search's navigation target to the supplied view. A retired
session resolves the hook without calling `view.goTo()`. This is independent of whether an in-flight
request itself was cancelled.

Opening a new session enables normal Search auto-navigation again. Replacing search A with search B
inside the same open Search session remains ArcGIS Search responsibility; FI-012 does not duplicate
its request-generation handling.

Locator uses the existing Main-map Escape priority through its public `close()` method. Escape close
restores focus to the Locator action. The controller also listens for outside pointer interactions and
composed `focusin` events. Focus paths that still contain the Locator host, including focus inside the
`arcgis-search` shadow DOM, remain open; focus moving to Product search or another external control
closes and clears Locator without stealing focus back. Both document listeners are removed during
teardown.

The app-level Escape handler yields when an inner control has prevented the Escape event. This
preserves the Search component's native handling of its own internal menus without manipulating
private shadow-DOM state.

## Failure behavior

Normal suggestion/result loading and network error rendering belong to the ArcGIS Search component.
FI-012 adds no fullscreen loader and does not duplicate local component errors with application
notices. Configuration failure disables Locator before a Search component is created, which also
prevents an implicit worldwide fallback.

## Future extension

Future genuinely different search domains can become additional logical ArcGIS Search sources behind
the same registry/factory without rewriting the Locator UI controller. For example, a future Product
Catalogue API or related/domain API source can implement explicit `getSuggestions` and `getResults`
callbacks with its own identity contract. If such sources are added, ArcGIS source-selection UI may
be useful because the choices would then represent different search domains rather than an internal
Denmark/Greenland split.

FI-012 does not migrate the existing Product search into Locator and does not reuse the current
client-side Product `GraphicsLayer` objects as `LayerSearchSource` inputs. Product search already owns
source-aware Product identity and popup semantics; a future API-backed Locator source should remain an
explicit API SearchSource instead.
