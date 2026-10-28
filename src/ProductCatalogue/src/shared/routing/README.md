# Analyze and Review public routes

Canonical public routes:

```text
/Analyze?Datasets=ProductA,ProductB
/Review?Datasets=ProductA,ProductB
```

`workspaceRoute.js` owns URL construction, parsing, normalization, and browser-history updates.
The existing Analyze and Review route modules remain thin navigation/title adapters. App bootstrap
and workspace `popstate` handlers use the same parser. Product Collection, Dashboard, popup Analyze,
and navbar links all use these adapters, including new-tab navigation.

## Identity and encoding

Dataset names are globally unique across Product sources. The URL contains dataset names only;
source identity and capability checks remain in `workspaceProductService` and Product context.
The route helper does not resolve Products, select providers, or make API requests.

Normalization preserves baseline list semantics: trim surrounding whitespace, omit empty values,
and deduplicate in first-occurrence order. Analyze compares lowercase identity keys; Review compares
uppercase keys, as their existing list models do. Serialized values retain the first spelling.
There is no sorting or source-name branching.

The canonical parameter is case-sensitive `Datasets`. One comma-delimited value is serialized with
`URL` and `URLSearchParams`; the browser may display the separator as `%2C`. Ampersands, plus signs,
slashes, question marks, hashes, percent signs, spaces, and Unicode are encoded as data. Parsing
uses the platform decoder exactly once. Missing or empty values yield an empty Product list.
If `Datasets` occurs more than once, the first value wins. When query and legacy path values coexist,
`Datasets` takes precedence, including an explicitly empty value.

Already parsed arrays remain atomic during catalog validation. Picker free text still accepts the
baseline ampersand, newline, and comma separators. Selecting a catalog result can supply a reserved
character inside an atomic name without interpreting it as a separator.

## Loading and history

Parsed names enter the existing workspace list, catalog validation, and source-aware resolver.
A complete catalog rejects unknown names using the existing notice flow while retaining valid names.
An incomplete catalog allows unresolved names through to the existing truthful failed/unavailable
surfaces. Unsupported Products never gain compatibility context or backend calls from routing.

After an initial or browser-history load, the validated active set replaces the current URL without
reload. The existing request-generation check runs before asynchronous completion can canonicalize
it. An empty validated set is canonicalized immediately. A failed overall load does not publish a
successful canonicalization. Individual failed/unavailable Products retain the established loader
behavior and do not prevent other Products from loading.

Picker add/remove/enable changes synchronize the active set through `history.replaceState` by
default. Identical URLs create no history writes. Explicit callers can still request `pushState`
with `{ replace: false }`; `popstate` consumers remain in place. Both workspaces continue to put only
enabled Products in the URL; disabled entries and Review content toggles remain local state.
History state fields, unrelated query parameters, and fragments survive synchronization.
Deployment under Vite `BASE_URL` remains supported.

## Temporary legacy compatibility and limits

`/Analyze/ProductA&ProductB` and `/Review/ProductA&ProductB`, including baseline lowercase paths,
are parsed temporarily. Each ampersand-separated component is decoded separately. Malformed legacy
percent escapes remain literal input for validation/resolution. Successful workspace loading replaces
the legacy URL with its canonical query representation without navigation or a new history entry.
No current producer constructs legacy Product paths.

A comma inside one dataset name is ambiguous under the fixed comma-delimited public contract.
The baseline free-text picker already treats commas as separators, but the catalog does not formally
prohibit them. No additional escape format is invented here. The URL builder returns `null` for such
a set; Collection/popup navigation shows an unavailable-link notice and Dashboard disables the link.
An existing legacy URL containing such an atomic name stays unchanged while its workspace loads;
URL synchronization resumes once the active set is representable. These exceptional sets cannot be
shared or synchronized canonically without a separately agreed name/escaping contract. A percent-
encoded comma in `Datasets` is still a separator, not an escape for an embedded comma.

Raw ampersands already separating legacy Products cannot be inferred to belong to a single name.
Only the baseline per-name encoded ampersand (`%26`) has that meaning. Legacy slash/path and malformed
escape behavior remains subject to the host's request handling. IIS/ASP.NET direct-load handling
must be checked locally because this archive contains the frontend only.
