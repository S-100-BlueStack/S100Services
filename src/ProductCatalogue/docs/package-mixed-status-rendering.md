# Package mixed-status AOI rendering foundation

## Scope and acceptance state

F2 provides the rendering boundary for mixed member Product statuses. F4 now maps the live backend
`GET electronicproducts/aoi?layer=ENC` response into its normalized application input. Server-mapped
S-101/S-57 member statuses render automatically; no Product-detail polling or helper invocation is
needed. No package actions are added. The existing application shape is:

```js
{
  workflowStatus,
  members: [{ key, status }],
}
```

This is a production candidate. The multi-color CIM stripe balance, opacity and line spacing still
require manual light/dark-theme and representative-volume browser acceptance before the symbol choice
is final.

## Rendering contract

`memberStatusRenderingProjection.js` is separate from the F1 filtering projection. It reads only
`members[].status`; `workflowStatus` can never affect AOI symbolization. Missing and empty statuses are
removed, scalar/string equivalents are normalized to trimmed strings, duplicates are removed and the
result is sorted. Member keys and input order are irrelevant.

- No usable member status: use the representative Graphic's existing scalar `status`.
- One distinct member status: use the ordinary scalar symbol for that supplied status.
- Two or more distinct member statuses: use the mixed polygon symbol.

The package layer opts in with the immutable application-owned strategy
`{ type: "work-unit-member-status" }`. Simple sources have no strategy and keep scalar rendering even
if an unrelated attribute happens to be named `workUnitStatus`. The strategy is passed to both data
transformers during initial Graphic construction and stored as `appSymbolization` on the GraphicsLayer.
Later attribute updates resolve it through the public `Graphic.layer` property. Reconciliation treats
the strategy as layer compatibility metadata and keeps matching Graphic instances in place.

`correctionSymbolResolver.js` is the single rendering decision path. Member-aware rendering applies
only to polygon geometry. Points, polylines and missing geometry fail closed to the representative
scalar symbol.

## ArcGIS symbol choice

Mixed polygons use one documented public ArcGIS `CIMSymbol` autocast with a `CIMPolygonSymbol`.
The first deterministic normalized member status supplies a translucent `CIMSolidFill`; every
additional distinct member status supplies a `CIMHatchFill` using that status' existing palette color.
For the current two-member package this produces one status-colored base plus diagonal stripes in the
other status color, so both Product results remain visible on one Graphic. The deterministic order is
based on normalized status values, not member identity, so hatch direction never means S-101 or S-57.
For more than two distinct statuses, additional hatch layers receive deterministic angles between 30
and 150 degrees.

The base fill uses `0.35` alpha, hatch strokes use `0.65` alpha with width `3` and separation `8`, and
the outline keeps the base status color at `0.7` alpha. Unknown/future values use the existing black
unknown-status fallback and do not gain a new semantic color. Ordinary scalar symbols remain the
existing `SimpleFillSymbol` shape with `0.15` fill alpha and unchanged outline behavior. No child
Graphic, duplicate geometry, second layer or renderer is introduced.

## Manual browser setup

Start the Vite development server, open the Main map, wait for ENC-package AOIs to load and paste the
following into DevTools. It imports only production modules already served by Vite and makes no
network requests. The helper exists only in the current page session.

```js
const { getAllLayers } = await import("/src/features/map/core/layerRegistry.js");
const { applyGraphicAttributes } = await import("/src/features/map/state/featureState.js");

const packageLayers = getAllLayers().filter(
  (layer) => layer.appSourceDefinition?.workUnit?.kind === "package"
);
const packageGraphics = packageLayers.flatMap(
  (layer) => layer.graphics?.toArray?.() ?? Array.from(layer.graphics ?? [])
);
const cloneValue = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const snapshots = packageGraphics.map((graphic) => ({
  graphic,
  hadWorkUnitStatus: Object.hasOwn(graphic.attributes ?? {}, "workUnitStatus"),
  workUnitStatus: cloneValue(graphic.attributes?.workUnitStatus),
}));

const applyMembers = (graphics, statuses) => {
  for (const graphic of graphics) {
    applyGraphicAttributes(graphic, {
      workUnitStatus: {
        workflowStatus: "manual-test-only",
        members: statuses.map((status, index) => ({ key: `member-${index + 1}`, status })),
      },
    });
  }
};

const findPackageGraphic = (datasetName) => {
  const matches = packageGraphics.filter(
    (graphic) => graphic.attributes?.datasetName === datasetName
  );

  if (matches.length !== 1) {
    console.warn(
      `Expected exactly one package Graphic for "${datasetName}", found ${matches.length}.`
    );
    return null;
  }

  return matches[0];
};

globalThis.f2MixedStatusTest = {
  count: packageGraphics.length,
  list() {
    console.table(
      packageGraphics.map((graphic) => ({
        datasetName: graphic.attributes?.datasetName,
        productKey: graphic.attributes?.productKey,
        status: graphic.attributes?.status,
      }))
    );
  },
  oneMixed() {
    applyMembers(packageGraphics.slice(0, 1), [8, 11]);
  },
  mixed(datasetName, statuses = [8, 11]) {
    const graphic = findPackageGraphic(datasetName);
    if (graphic) {
      applyMembers([graphic], statuses);
    }
  },
  allMixed() {
    applyMembers(packageGraphics, [8, 11]);
  },
  oneEqual() {
    applyMembers(packageGraphics.slice(0, 1), [8, "8"]);
  },
  workflowOnly() {
    for (const graphic of packageGraphics.slice(0, 1)) {
      applyGraphicAttributes(graphic, {
        workUnitStatus: { workflowStatus: "manual-workflow-change" },
      });
    }
  },
  restore() {
    for (const snapshot of snapshots) {
      const attributes = { ...(snapshot.graphic.attributes ?? {}) };
      if (snapshot.hadWorkUnitStatus) {
        attributes.workUnitStatus = cloneValue(snapshot.workUnitStatus);
      } else {
        delete attributes.workUnitStatus;
      }
      snapshot.graphic.attributes = attributes;
      snapshot.graphic.set?.("attributes", attributes);
      applyGraphicAttributes(snapshot.graphic, { status: attributes.status });
    }
  },
};

console.log(`F2 helper ready for ${packageGraphics.length} package Graphics.`);
```

Use one command at a time and call `f2MixedStatusTest.restore()` between scenarios. Use `list()` to
find a concrete package dataset, then `mixed(datasetName, statuses)` to exercise the exact statuses you
want to inspect:

```js
f2MixedStatusTest.list();
f2MixedStatusTest.mixed("YOUR_DATASET_NAME", [1, 15]);
f2MixedStatusTest.restore();

f2MixedStatusTest.oneMixed();
f2MixedStatusTest.restore();

f2MixedStatusTest.oneEqual();
f2MixedStatusTest.restore();

f2MixedStatusTest.workflowOnly();
f2MixedStatusTest.restore();

f2MixedStatusTest.allMixed();
f2MixedStatusTest.restore();
```

This helper is diagnostic only. A real source refresh replaces synthetic state with authoritative
backend member state, including scalar fallback when member state is incomplete. It is not the
acceptance path for live mixed packages; use real data or an authoritative local API fixture.

## Manual acceptance checklist

1. Before invoking the helper, verify equal live member statuses render scalar and differing live member statuses render mixed.
2. `mixed(datasetName, [1, 15])` or `oneMixed()` changes one package polygon to the multi-color mixed
   symbol. Confirm that both status colors are visibly present as base-plus-stripe styling while the
   package remains one Graphic with the same geometry, selection identity and popup.
3. Restore, run `oneEqual()` and confirm equal member statuses produce an ordinary scalar fill.
4. Restore, run `workflowOnly()` and confirm workflow state alone does not affect the symbol.
5. Confirm `restore()` returns AOIs to their original live scalar or mixed state without reloading.
6. Exercise Product search, hover, normal click, modifier-click, overlap picker, popup and Product
   Collection. Each package must remain one work unit and one Graphic.
7. With mixed state applied, toggle Status values that match the workflow/member values and confirm F1
   retains workflow-or-member matching. Reload/restore persisted filters as usual.
8. Toggle Display scale hiding and zoom across the threshold. Visibility must remain independent of
   the symbol.
9. Run `allMixed()` for the normal loaded AOI count, then pan, zoom, hover and open several popups.
   Compare qualitatively with scalar rendering; there should be no obvious stalls or material loss of
   responsiveness.
10. Refresh the package source. Confirm no duplicate Graphics and no selection identity loss during
    in-place reconciliation. The current payload is expected to restore scalar rendering.
11. Confirm the Network panel shows no new Product-detail or background requests from symbolization.
12. Repeat the visual and interaction checks in both light and dark themes. Confirm both mixed status
    colors are distinguishable at normal zoom without overpowering outlines, hover highlight or
    neighboring AOIs.

No universal FPS or timing threshold is defined. Acceptance requires representative local browser
testing because automated Node tests cannot establish ArcGIS rendering quality or interactive map
performance.
