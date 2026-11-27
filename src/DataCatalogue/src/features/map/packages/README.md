# Selected Package geometry and detailed point labels

The live Main Map Package Details and Package Assignment map use the same
`createPackageGeometryOverlay` and `createPackageGraphics` boundary. The
existing selected-Package geometry read provides AOI, points, curves and
surfaces. The AOI overview, Workspace layers and historical mock maps are
separate consumers. No new Detailed View toggle is introduced.

## DC-DETAILED-POINT-LABELS-01

The current backend contract declares `detailedGeometry.points` in stored
reference order. `NoticeToMariners.Parse` enumerates source `parts`, then
`geometry.features`; `GeoJsonPackageGeometry.AddGeometry` appends each Point
or MultiPoint coordinate to one list. `Build` serializes that list as an Esri
multipoint. The creation service passes it to the native geometry builder;
`PackageRepository.AddPackageGeometries` retains Point-class rows in an ordered
`PointRefs` array, or stores a multipoint where that shape type is supported.
Package events retain the references and geometry reads resolve them in order.
The documented sample template stores pointset members as individual Point rows.

The frontend uses that single collection, with ordinals starting at `1` for
each selected Package. It does not sort by location, ObjectID, Job identity or
Workspace. Multipoint coordinates are visited in their returned array order;
AOI, line and polygon vertices do not receive or consume numbers. Projection is
not a source of ordering. The original Notice part identifiers and external
coordinate-list indices are not exposed by this API. The frontend cannot
recover numbering that differs from the imported sequence or has been lost
before the response. The source export excludes actual samples and native
geodatabase data; comparison against a real Notice's coordinates is a required
local acceptance check, not a completed runtime verification.

`prepareDetailedPointLabels` reuses the projected point graphics' anchors for
single points and independently projects multipoint members using the existing
operator. Exact coincident display positions share one native label (for
example `1, 3`); every original ordinal remains represented. Original graphics,
point/multipoint marker symbols, focus extent and geometry-item counts remain
unchanged. Labels are dark, haloed, below the markers, and use the existing
`createMapLabelLayers` public client-side FeatureLayer strategy. No additional
scale cutoff is imposed; static collision avoidance can suppress crowded labels
until the user zooms in. Existing Workspace and Package short ID scale settings
are unchanged. No external layer URL, new geometry HTTP call or additional
selection lifecycle is needed.

Labels are prepared in the same generation as the geometry, not published
independently. Replacement swaps both snapshots; the old geometry and its
labels remain together during the existing pending-selection policy. Clear,
error and destroy remove the labels. A label-only preparation/construction
failure is logged without invalidating the authoritative geometry. A failed
member projection does not publish a partial renumbered sequence.

Local acceptance: compare a known multi-point Notice with its original list,
including non-spatial order and repeated coordinates; switch Packages rapidly,
return to overview, repeat the same Package in another context, use Focus and
Retry, check both themes and zoom/pan, and confirm no extra geometry API reads.
See the [tracker](../../../../docs/PROJECT_TRACKER.md) for candidate status.
