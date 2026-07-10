using ArcGIS.Core.Data;
using ArcGIS.Core.Geometry;
using GeoAPI.Geometries;
using NetTopologySuite.Geometries;
using NetTopologySuite.Noding;
using NetTopologySuite.Noding.Snapround;
using NetTopologySuite.Operation.Linemerge;
using NetTopologySuite.Operation.Valid;
using S100Framework.REST.Clients;
using S100Framework.REST.Models;
using System.Globalization;
using System.IO.Compression;
using System.Text;


namespace S100FC.ProductCatalogue
{
    public static class Extensions
    {
        static readonly SpatialReference spatialReference = SpatialReferenceBuilder.CreateSpatialReference(4326);

        static readonly GeometryFactory factory = new GeometryFactory(new PrecisionModel(10000000), srid: 4326); // Or PrecisionModels.Floating

        public static async Task<S100FC.Topology.IMatrix?> BuildTopology(this FeatureServiceClient client) {
            var matrix = S100FC.Topology.Reloaded.CreateMatrix();

            S100FC.Topology.ITopologyBuilder? builder = default;
            var s101Clause = "upper(ps) = 'S-101' ";

            //  Skin of the Earth
            {
                var polygons = new List<S100FC.Topology.Polygon>();

                var surfaceClient = await client.GetLayerClientAsync("surface");

                var surfaceFeatures = await surfaceClient.QueryAsync(new FeatureQuery {
                    Where = $"upper(ps) = 'S-101' AND (upper(code) IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA'))",
                    ReturnGeometry = true,
                }).ToListAsync();

                foreach (var surfaceFeature in surfaceFeatures) {
                    var f = surfaceFeature;
                    var shape = f.Geometry as NetTopologySuite.Geometries.Polygon;

                    var name = $"{f.Attributes["UID"]}";
                    var code = $"{f.Attributes["code"]}";

                    var exteriorRing = shape.ExteriorRing.RemoveRepeatedVertices();
                    var interiorRings = new List<LineString>();

                    for (int i = 0; i < shape.NumInteriorRings; i++) {
                        var ring = (LineString)shape.GetInteriorRingN(i).RemoveRepeatedVertices();
                        interiorRings.Add(ring);
                    }

                    polygons.Add(new S100FC.Topology.Polygon(f.ObjectId!.Value, name, code, exteriorRing, [.. interiorRings]
                        )
                    );

                }


                var curves = new List<S100FC.Topology.Polyline>();

                var curveClient = await client.GetLayerClientAsync("curve");

                var curveFeatures = await curveClient.QueryAsync(new FeatureQuery {
                    Where = $"upper(ps) = 'S-101' AND (upper(code) IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA'))",
                    ReturnGeometry = true,
                }).ToListAsync();

                foreach (var curveFeature in curveFeatures) {
                    var f = curveFeature;
                    var shape = f.Geometry as LineString;
                    var name = $"{f.Attributes["UID"]}";
                    var code = $"{f.Attributes["code"]}";

                    var linestring = shape.RemoveRepeatedVertices();

                    curves.Add(new S100FC.Topology.Polyline(f.ObjectId.Value!, name, code, linestring, name));
                }

                builder = matrix.AddTopologyFeatures(polygons, curves);

            }



            //  Navigational features
            {
                var polygons = new List<S100FC.Topology.Polygon>();

                var surfaceClient = await client.GetLayerClientAsync("surface");

                var surfaceFeatures = await surfaceClient.QueryAsync(new FeatureQuery {
                    Where = $"upper(ps) = 'S-101' AND (upper(code) NOT IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA'))",
                    ReturnGeometry = true,
                }).ToListAsync();


                foreach (var surfaceFeature in surfaceFeatures) {
                    var f = surfaceFeature;

                    var shape = f.Geometry as NetTopologySuite.Geometries.Polygon;


                    var name = $"{f.Attributes["UID"]}";
                    var code = $"{f.Attributes["code"]}";

                    var exteriorRing = (LineString)shape.ExteriorRing.RemoveRepeatedVertices();

                    var interiorRings = new List<LineString>();

                    for (int i = 0; i < shape.NumInteriorRings; i++) {
                        var ring = (LineString)shape.GetInteriorRingN(i).RemoveRepeatedVertices();
                        interiorRings.Add(ring);
                    }

                    polygons.Add(new S100FC.Topology.Polygon(f.ObjectId.Value!, name, code, exteriorRing, [.. interiorRings]));
                }


                var curves = new List<S100FC.Topology.Polyline>();
                var singletons = new List<S100FC.Topology.Polyline>();

                var singletonsFeatures = "''";// "'ROAD','RAILWAY'";  //'NAVIGATIONLINE','RECOMMENDEDTRACK'

                // Not in singleton features
                var curveClient = await client.GetLayerClientAsync("curve");
                {
                    var curveFeatures = await curveClient.QueryAsync(new FeatureQuery {
                        Where = $"upper(ps) = 'S-101' AND (upper(code) NOT IN ('COASTLINE','DEPTHCONTOUR','SHORELINECONSTRUCTION')) AND (upper(code) NOT IN ({singletonsFeatures}))",
                        ReturnGeometry = true,
                    }).ToListAsync();

                    foreach (var curveFeature in curveFeatures) {
                        var f = curveFeature;
                        var shape = f.Geometry as LineString;
                        var name = $"{f.Attributes["UID"]}";
                        var code = $"{f.Attributes["code"]}";

                        var linestring = shape.RemoveRepeatedVertices();

                        curves.Add(new S100FC.Topology.Polyline(f.ObjectId.Value!, name, code, linestring, name));
                    }
                }

                // In singleton features
                {
                    var curveFeatures = await curveClient.QueryAsync(new FeatureQuery {
                        Where = $"upper(ps) = 'S-101' AND (upper(code) IN ({singletonsFeatures}))",
                        ReturnGeometry = true,
                    }).ToListAsync();

                    foreach (var curveFeature in curveFeatures) {
                        var f = curveFeature;
                        var shape = f.Geometry as LineString;
                        var name = $"{f.Attributes["UID"]}";
                        var code = $"{f.Attributes["code"]}";


                        var linestring = shape.RemoveRepeatedVertices();

                        curves.Add(new S100FC.Topology.Polyline(f.ObjectId.Value!, name, code, linestring, name));
                    }
                }


                builder = matrix.AddNavigationalFeatures(polygons, curves);//.AddSingletonFeatures(singletons);
            }

            var result = builder.BuildTopology();

            return result;
        }

        public static (S100FC.Topology.IMatrix matrix, IDictionary<string, string> mapper) BuildTopology(this Geodatabase geodatabase, QueryFilter? queryFilter = default, Action<int, ICollection<(LineString lineString, string message)>>? interceptor = default) {
            var syntax = geodatabase.GetSQLSyntax();

            QueryFilter[] filters = [];
            ArcGIS.Core.Geometry.Geometry? filterGeometry = default;

            if (queryFilter is SpatialQueryFilter spatial) {
                filterGeometry = spatial.FilterGeometry;

                var contains = new SpatialQueryFilter {
                    FilterGeometry = spatial.FilterGeometry,
                    ObjectIDs = spatial.ObjectIDs,
                    Offset = spatial.Offset,
                    OutputSpatialReference = spatial.OutputSpatialReference,
                    PostfixClause = spatial.PostfixClause,
                    PrefixClause = spatial.PrefixClause,
                    RowCount = spatial.RowCount,
                    SearchOrder = spatial.SearchOrder,
                    SpatialRelationship = spatial.SpatialRelationship,
                    SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM_Contains,
                    SubFields = spatial.SubFields,
                    WhereClause = $"({spatial.WhereClause})",
                };

                var crosses = new SpatialQueryFilter {
                    FilterGeometry = spatial.FilterGeometry,
                    ObjectIDs = spatial.ObjectIDs,
                    Offset = spatial.Offset,
                    OutputSpatialReference = spatial.OutputSpatialReference,
                    PostfixClause = spatial.PostfixClause,
                    PrefixClause = spatial.PrefixClause,
                    RowCount = spatial.RowCount,
                    SearchOrder = spatial.SearchOrder,
                    SpatialRelationship = spatial.SpatialRelationship,
                    SpatialRelationshipDescription = S100FC.Topology.Matrix.DE9IM_Crosses,
                    SubFields = spatial.SubFields,
                    WhereClause = $"({spatial.WhereClause})",
                };

                filters = [contains, crosses];
            }
            else if (queryFilter is not null) {
                filters = [queryFilter];
            }
            else {
                queryFilter = new QueryFilter {
                    WhereClause = "upper(ps) = 'S-101'",
                };
                filters = [queryFilter];
            }

            var whereClause = queryFilter.WhereClause;
            var prefix = queryFilter.PrefixClause;

            S100FC.Topology.Matrix.Factory = S100FC.Topology.Reloaded.Factory = factory;

            var definitions = geodatabase.GetDefinitions<FeatureClassDefinition>();


            //var matrix = S100FC.Topology.Matrix.CreateMatrix(interceptor);
            var matrix = S100FC.Topology.Reloaded.CreateMatrix(interceptor);


            S100FC.Topology.ITopologyBuilder? builder = default;

            var clipGeometry = (ArcGIS.Core.Geometry.Geometry g) => {
                return g;
            };

            if (filterGeometry is not null) {
                clipGeometry = (ArcGIS.Core.Geometry.Geometry g) => {
                    if (g is Polyline polyline) return polyline;

                    if (GeometryEngine.Instance.Disjoint(g, filterGeometry)) return g;

                    if (!GeometryEngine.Instance.Relate(g, filterGeometry, S100FC.Topology.Matrix.DE9IM_Crosses)) return g;

                    var difference = GeometryEngine.Instance.Intersection(g, filterGeometry);

                    if (difference is ArcGIS.Core.Geometry.Polygon polygon) {
                        if (polygon.ExteriorRingCount > 1) {
                            ArcGIS.Core.Geometry.Polygon[] polygons = [];
                            ReadOnlySegmentCollection[] segments = [polygon.Parts[0]];
                            for (int i = 1; i < polygon.PartCount; i++) {
                                var p = PolygonBuilderEx.CreatePolygon(polygon.Parts[i]);
                                if (p.Area < 0)
                                    segments = [.. segments, polygon.Parts[i]];
                                else {
                                    var _ = PolygonBuilderEx.CreatePolygon(segments);
                                    polygons = [.. polygons, _];
                                    segments = [polygon.Parts[i]];
                                }
                            }
                            if (segments.Any()) {
                                var _ = PolygonBuilderEx.CreatePolygon(segments);
                                polygons = [.. polygons, _];
                            }
                            return g = PolygonBuilderEx.CreatePolygon(polygons);
                        }
                        else {
                            return polygon;
                        }
                    }
                    else
                        System.Diagnostics.Debugger.Break();

                    return g;
                };
            }

            var mapper = new Dictionary<string, string>();

            //  Skin of the Earth
            {
                var polygons = new List<S100FC.Topology.Polygon>();

                using (var surface = geodatabase.OpenDataset<FeatureClass>(definitions.Single(e => syntax.ParseTableName(e.GetName()).Item3.Equals("surface")).GetName())) {
                    //queryFilter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA'))";

                    foreach (var filter in filters) {
                        filter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA','SHORELINECONSTRUCTION'))";

                        using var cursor = surface.Search(filter);

                        var lookup = polygons.ToLookup(e => e.ObjectId, e => e);

                        while (cursor.MoveNext()) {
                            var f = (Feature)cursor.Current;

                            if (lookup.Contains(f.GetObjectID())) continue;

                            var shape = (ArcGIS.Core.Geometry.Polygon)f.GetShape();

                            var name = Convert.ToString(f["UID"]);
                            if (string.IsNullOrEmpty(name))
                                name = string.Empty;

                            shape = (ArcGIS.Core.Geometry.Polygon)clipGeometry(shape);
                            if (shape.IsEmpty) continue;

                            var exteriorRing = shape.GetExteriorRing(0);
                            var coordinates = exteriorRing.Parts[0].Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.StartPoint.X, segment.StartPoint.Y)).ToArray();

                            var ex = factory.CreateLinearRing([.. coordinates, coordinates[0]]);
                            ex = (LinearRing)matrix.Reducer.Reduce(ex);
                            //ex = ex.RemoveRepeatedVertices().RemoveCollinearVertices();
                            //ex.Normalize();

                            if (shape.PartCount > 1) {
                                var interiorRings = new List<LineString>();

                                foreach (var interiorRing in shape.Parts.Skip(1)) {
                                    coordinates = interiorRing.Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.StartPoint.X, segment.StartPoint.Y)).ToArray();

                                    var linestring = factory.CreateLinearRing([.. coordinates, coordinates[0]]);
                                    linestring = (LinearRing)matrix.Reducer.Reduce(linestring);
                                    //linestring = linestring.RemoveRepeatedVertices().RemoveCollinearVertices();
                                    //linestring.Normalize();

                                    if (!linestring.IsSelfIntersections())
                                        interiorRings.Add(linestring);
                                    else {
                                        foreach (var l in SplitAtSelfIntersections(linestring))
                                            interiorRings.Add(l);
                                    }
                                }

                                polygons.Add(new S100FC.Topology.Polygon(f.GetObjectID(), name, Convert.ToString(f["code"])!, ex, interiorRings.ToArray()));
                            }
                            else {
                                polygons.Add(new S100FC.Topology.Polygon(f.GetObjectID(), name, Convert.ToString(f["code"])!, ex, []));
                            }
                        }
                    }
                }

                var curves = new List<S100FC.Topology.Polyline>();

                using (var curve = geodatabase.OpenDataset<FeatureClass>(definitions.Single(e => syntax.ParseTableName(e.GetName()).Item3.Equals("curve")).GetName())) {
                    //queryFilter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) IN ('COASTLINE','DEPTHCONTOUR','SHORELINECONSTRUCTION'))";

                    foreach (var filter in filters) {
                        filter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) IN ('COASTLINE','DEPTHCONTOUR','SHORELINECONSTRUCTION'))";

                        using var cursor = curve.Search(filter);

                        var lookup = curves.ToLookup(e => e.ObjectId, e => e);

                        while (cursor.MoveNext()) {
                            var f = (Feature)cursor.Current;

                            if (lookup.Contains(f.GetObjectID())) continue;

                            var shape = (Polyline)f.GetShape();

                            shape = (Polyline)clipGeometry(shape);
                            if (shape.IsEmpty) continue;

                            var name = Convert.ToString(f["UID"]);
                            if (string.IsNullOrEmpty(name))
                                name = string.Empty;

                            //if ("F10500070853".Equals(name)) System.Diagnostics.Debugger.Break();

                            LineString[] parts = [];
                            foreach (var part in shape.Parts) {
                                var p = PolylineBuilderEx.CreatePolyline(part);

                                var coordinates = p.Points.Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.X, segment.Y)).ToArray();

                                var linestring = factory.CreateLineString([.. coordinates]);
                                linestring = (LineString)matrix.Reducer.Reduce(linestring);

                                if (!linestring.IsSelfIntersections())
                                    parts = [.. parts, linestring];
                                else {
                                    foreach (var l in SplitAtSelfIntersections(linestring))
                                        parts = [.. parts, l];
                                }
                            }
                            if (parts.Length == 1) {
                                curves.Add(new S100FC.Topology.Polyline(f.GetObjectID(), name, Convert.ToString(f["code"])!, parts[0], name));
                            }
                            else {
                                for (int i = 0; i < parts.Length; i++) {
                                    curves.Add(new S100FC.Topology.Polyline(f.GetObjectID(), $"{name}:{i}", Convert.ToString(f["code"])!, parts[i], name));
                                    mapper.Add($"{name}:{i}", name);
                                }
                            }
                        }
                    }
                }

                builder = matrix.AddTopologyFeatures(polygons, curves);
            }

            //  Navigational features
            {
                //string[] testFeatures = ["DataCoverage", "SoundingDatum", "VerticalDatum", "NavigationalSystemOfMarks"];
                string[] testFeatures = ["DataCoverage"];

                var polygons = new List<S100FC.Topology.Polygon>();

                using (var surface = geodatabase.OpenDataset<FeatureClass>(definitions.Single(e => syntax.ParseTableName(e.GetName()).Item3.Equals("surface")).GetName())) {
                    //queryFilter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) NOT IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA'))";

                    foreach (var filter in filters) {
                        filter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) NOT IN ('DEPTHAREA','DREDGEDAREA','LANDAREA','UNSURVEYEDAREA'))";

                        using var cursor = surface.Search(filter);

                        var lookup = polygons.ToLookup(e => e.ObjectId, e => e);

                        while (cursor.MoveNext()) {
                            var f = (Feature)cursor.Current;

                            if (lookup.Contains(f.GetObjectID())) continue;


#if SKIN_OF_THE_EARTH_ONLY
                            if (!testFeatures.Contains(Convert.ToString(f["code"]))) continue;
#endif
                            var shape = (ArcGIS.Core.Geometry.Polygon)f.GetShape();

                            var name = Convert.ToString(f["UID"]);
                            if (string.IsNullOrEmpty(name))
                                name = string.Empty;

                            shape = (ArcGIS.Core.Geometry.Polygon)clipGeometry(shape);
                            if (shape.IsEmpty) continue;

                            var exteriorRing = shape.GetExteriorRing(0);
                            var coordinates = exteriorRing.Parts[0].Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.StartPoint.X, segment.StartPoint.Y)).ToArray();

                            //for (int _ = 0; _ < coordinates.Length; _++)
                            //    coordinates[_] = SnapToGrid(coordinates[_]);

                            var ex = factory.CreateLinearRing([.. coordinates, coordinates[0]]);
                            ex = (LinearRing)matrix.Reducer.Reduce(ex);
                            //ex = ex.RemoveRepeatedVertices().RemoveCollinearVertices();

                            if (shape.PartCount > 1) {
                                var interiorRings = new List<LineString>();

                                foreach (var interiorRing in shape.Parts.Skip(1)) {
                                    coordinates = interiorRing.Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.StartPoint.X, segment.StartPoint.Y)).ToArray();

                                    var linestring = factory.CreateLinearRing([.. coordinates, coordinates[0]]);
                                    linestring = (LinearRing)matrix.Reducer.Reduce(linestring);
                                    //linestring = linestring.RemoveRepeatedVertices().RemoveCollinearVertices();
                                    //linestring.Normalize();

                                    if (!linestring.IsSelfIntersections())
                                        interiorRings.Add(linestring);
                                    else {
                                        foreach (var l in SplitAtSelfIntersections(linestring))
                                            interiorRings.Add(l);
                                    }
                                }

                                polygons.Add(new S100FC.Topology.Polygon(f.GetObjectID(), name, Convert.ToString(f["code"])!, ex, interiorRings.ToArray()));
                            }
                            else {
                                polygons.Add(new S100FC.Topology.Polygon(f.GetObjectID(), name, Convert.ToString(f["code"])!, ex, []));
                            }
                        }
                    }
                }

                var curves = new List<S100FC.Topology.Polyline>();
                var singletons = new List<S100FC.Topology.Polyline>();

                var singletonsFeatures = "''";// "'ROAD','RAILWAY'";  //'NAVIGATIONLINE','RECOMMENDEDTRACK'

                using (var curve = geodatabase.OpenDataset<FeatureClass>(definitions.Single(e => syntax.ParseTableName(e.GetName()).Item3.Equals("curve")).GetName())) {
                    //queryFilter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) NOT IN ('COASTLINE','DEPTHCONTOUR','SHORELINECONSTRUCTION')) AND (upper(code) NOT IN ({singletonsFeatures}))"; //,'NAVIGATIONLINE','RECOMMENDEDTRACK'

                    foreach (var filter in filters) {
                        filter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) NOT IN ('COASTLINE','DEPTHCONTOUR','SHORELINECONSTRUCTION')) AND (upper(code) NOT IN ({singletonsFeatures}))"; //,'NAVIGATIONLINE','RECOMMENDEDTRACK'

                        using var cursor = curve.Search(filter);

                        var lookup = curves.ToLookup(e => e.ObjectId, e => e);

                        while (cursor.MoveNext()) {
                            var f = (Feature)cursor.Current;

                            if (lookup.Contains(f.GetObjectID())) continue;

#if SKIN_OF_THE_EARTH_ONLY
                            continue;
#endif

                            var shape = (Polyline)f.GetShape();

                            shape = (Polyline)clipGeometry(shape);
                            if (shape.IsEmpty) continue;

                            var name = Convert.ToString(f["UID"]);
                            if (string.IsNullOrEmpty(name))
                                name = string.Empty;

                            LineString[] parts = [];
                            foreach (var part in shape.Parts) {
                                var p = PolylineBuilderEx.CreatePolyline(part);

                                var coordinates = p.Points.Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.X, segment.Y)).ToArray();

                                var linestring = factory.CreateLineString([.. coordinates]);
                                linestring = (LineString)matrix.Reducer.Reduce(linestring);

                                if (!linestring.IsSelfIntersections())
                                    parts = [.. parts, linestring];
                                else {
                                    foreach (var l in SplitAtSelfIntersections(linestring))
                                        parts = [.. parts, l];
                                }
                            }
                            if (parts.Length == 1) {
                                curves.Add(new S100FC.Topology.Polyline(f.GetObjectID(), name, Convert.ToString(f["code"])!, parts[0], name));
                            }
                            else {
                                for (int i = 0; i < parts.Length; i++) {
                                    curves.Add(new S100FC.Topology.Polyline(f.GetObjectID(), $"{name}:{i}", Convert.ToString(f["code"])!, parts[i], name));
                                    mapper.Add($"{name}:{i}", name);
                                }
                            }
                        }
                    }

                    //queryFilter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) IN ({singletonsFeatures}))";

#if Singletons
                    foreach (var filter in filters) {
                        filter.WhereClause = (!string.IsNullOrEmpty(whereClause) ? $"{whereClause} AND " : "") + $"(upper(code) IN ({singletonsFeatures}))";

                        using var cursor = curve.Search(filter);

                        var lookup = singletons.ToLookup(e => e.ObjectId, e => e);

                        while (cursor.MoveNext()) {
                            var f = (Feature)cursor.Current;

                            if (lookup.Contains(f.GetObjectID())) continue;

                            //if (f.GetObjectID() == 44) System.Diagnostics.Debugger.Break();

                            var shape = (Polyline)f.GetShape();

                            shape = (Polyline)clipGeometry(shape);

                            var name = Convert.ToString(f["UID"]);
                            if (string.IsNullOrEmpty(name))
                                name = string.Empty;

                            //var coordinates = shape.Points.Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.X, segment.Y)).ToArray();

                            //var linestring = factory.CreateLineString([.. coordinates]);
                            //linestring = linestring.RemoveRepeatedVertices();

                            //singletons.Add(new S100FC.Topology.Polyline(f.GetObjectID(), name, Convert.ToString(f["code"])!, linestring));
                            for (int i = 0; i < shape.PartCount; i++) {
                                var p = PolylineBuilderEx.CreatePolyline(shape.Parts[i]);

                                var coordinates = p.Points.Select(segment => new NetTopologySuite.Geometries.Coordinate(segment.X, segment.Y)).ToArray();

                                var linestring = factory.CreateLineString([.. coordinates]);
                                linestring = linestring.RemoveRepeatedVertices();

                                singletons.Add(new S100FC.Topology.Polyline(f.GetObjectID(), $"{name}:p{i}", Convert.ToString(f["code"])!, linestring, name));                                
                            }
                        }
                    }
#endif
                }

                builder = matrix.AddNavigationalFeatures(polygons, curves);//.AddSingletonFeatures(singletons);
            }

            var result = builder.BuildTopology();


            //interceptor?.Invoke(6001, result.Curves.Select(e => (e.LineString, $"{e.Id}")).ToArray());


            return (result, mapper);
        }


        public static MemoryStream ZipIt(string yaml, string index, string sign) {
            var zipStream = new MemoryStream();

            using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, leaveOpen: true)) {
                AddFileToArchive(archive, "yaml", yaml);
                AddFileToArchive(archive, "index", index);
                AddFileToArchive(archive, "sign", sign);
            }

            // 4. Reset position so the reader starts at the beginning
            zipStream.Position = 0;

            return zipStream;

            static void AddFileToArchive(ZipArchive archive, string fileName, string content) {
                var entry = archive.CreateEntry(fileName);
                using var entryStream = entry.Open();
                using var writer = new StreamWriter(entryStream, Encoding.UTF8);
                writer.Write(content);
            }
        }
        private const double _snapTolerance = 0.000000001;

        private static Coordinate SnapToGrid(Coordinate c) {
            double inv = 1.0 / _snapTolerance;
            double x = Math.Round(c.X * inv) / inv;
            double y = Math.Round(c.Y * inv) / inv;

            // Preserve Z if present
            return double.IsNaN(c.Z)
                ? new Coordinate(x, y)
                : new CoordinateZ(x, y, c.Z);
        }

        private static Polyline CreateLinearRing(string[] coords, SpatialReference spatialReference) {
            var points = new MapPoint[coords.Length / 2];
            for (int i = 0; i < coords.Length; i += 2) {
                var p = MapPointBuilderEx.CreateMapPoint(
                    double.Parse(coords[i + 1], CultureInfo.InvariantCulture),
                    double.Parse(coords[i + 0], CultureInfo.InvariantCulture),
                    spatialReference);
                points[i / 2] = p;
            }
            return PolylineBuilderEx.CreatePolyline(points, spatialReference);
        }

        public static bool IsSelfIntersections(this LineString lineString) {
            var locations = new List<Coordinate>();

            // Use IsValidOp which reports exact error locations
            var validOp = new IsValidOp(lineString);

            if (!validOp.IsValid) {
                var error = validOp.ValidationError;
                if (error != null)
                    locations.Add(error.Coordinate);
            }

            // Also check IsSimple for non-simple (self-touching) cases
            bool isSelfIntersecting = !lineString.IsSimple || locations.Any();

            return isSelfIntersecting;
            //return (isSelfIntersecting, locations);
        }

        public static List<LineString> SplitAtSelfIntersections(LineString lineString) {
            var pm = lineString.Factory.PrecisionModel;

            // 1. Node the linestring — inserts split points at every intersection
            var noder = new SnapRoundingNoder(pm);
            var nodedSegments = NodeLineString(lineString, noder);

            // 2. Reassemble noded segments into a geometry
            var lines = nodedSegments
                .Cast<NodedSegmentString>()
                .Select(s => lineString.Factory.CreateLineString(s.Coordinates))
                .ToArray();

            // 3. Use LineMerger to produce clean, non-overlapping LineStrings
            var merger = new LineMerger();
            merger.Add(lines);

            return merger.GetMergedLineStrings()
                .Cast<LineString>()
                .ToList();
        }

        public static Dictionary<string, string> ReadZippedData(MemoryStream stream) {
            var files = new Dictionary<string, string>();
            stream.Position = 0;

            // Open the stream as a ZipArchive
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: true);

            foreach (ZipArchiveEntry entry in archive.Entries) {
                var key = entry.Name;
                if (entry.Name.EndsWith(".yaml", StringComparison.InvariantCultureIgnoreCase))
                    key = "yaml";
                else if (entry.Name.EndsWith(".idx", StringComparison.InvariantCultureIgnoreCase))
                    key = "index";
                else if (entry.Name.EndsWith(".sign", StringComparison.InvariantCultureIgnoreCase))
                    key = "catalogue";

                using var entryStream = entry.Open();
                using var reader = new StreamReader(entryStream);
                files.Add(entry.FullName, reader.ReadToEnd());
            }

            return files;
        }


        private static IList<ISegmentString> NodeLineString(
        LineString lineString,
        INoder noder) {
            var segmentString = new NodedSegmentString(
                lineString.Coordinates, null);

            var segments = new List<ISegmentString> { segmentString };
            noder.ComputeNodes(segments);

            return noder.GetNodedSubstrings();
        }

    }
}