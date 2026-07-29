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


                builder = matrix.AddTopologyFeatures(polygons, curves);//.AddSingletonFeatures(singletons);
            }

            var result = builder.BuildTopology();

            return result;
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

    }
}