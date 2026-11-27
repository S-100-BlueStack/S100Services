# Creator map

A separate MapView uses shared basemap settings, the default view constraints
and a Creator-specific position slot. The sketch owner attaches one public
`arcgis-sketch` component to an editable GraphicsLayer. Rectangle, Polygon and
Circle use native creation. Click an accepted graphic to move or reshape it.
The native delete action affects the selection. Native Undo/Redo is available
during the current operation. Clear AOI removes the draft and Fit AOI navigates
to all accepted graphics. The toolbar sits inside the map above attribution.

The sketch controller snapshots each accepted graphic. Cancellation or
rejected topology restores the last valid draft. Submission is blocked during
an active operation. Pending, unknown and confirmed creation lock the sketch
and its map-click update path. Late events cannot change the accepted draft.

The geometry adapter validates input as XY Polygon in WGS 84 or Web Mercator
and rejects world copies, date-line spanning rings and invalid topology.
Sketch circle rings remain polygons. Where the SDK returns true curves,
the adapter densifies only curves with a 2-degree angular subdivision and a
deviation setting in source units. A planar Esri union in the view reference
dissolves overlaps and preserves separate parts and holes. The WGS 84 output
uses shape-preserving projection for Web Mercator with a target deviation
of 0.0000001 degrees, then revalidates topology and ring coordinates. No
coordinate rounding is added before the existing Esri JSON serialization.
The operation rejects unsupported shapes rather than using a bounding box.

The one polygon goes through the current AOI-only creation path. The grouped
geometry and archive envelope convention stays separate. The backend matches
Workspace membership with the stored polygon and active binding. Native
persistence and Workspace gaps require local acceptance.

The committed preview uses the existing selected-Package source, overlay,
and renderer. It uses the stored shape, and detached draft areas remain
separate from the committed display.
