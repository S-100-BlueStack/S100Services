using ArcGIS.Core.Geometry;
using ArcGIS.Core.Geometry.Exceptions;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using System.Security.Cryptography;
using System.Text.Json;

namespace DataCatalague.Api.Services;

/// <summary>Coordinates ArcGIS geometry writes and the package event that makes their references current.</summary>
public sealed class PackageGeometryService(IEventStore eventStore, StreamNameMap streamNameMap, ICommandService<PackageState> commands, PackageRepository repository, ArcGisDispatcher dispatcher, ILogger<PackageGeometryService> logger)
{
    // The current API has one in-memory event store. Serialize replacement writes
    // across request scopes so retries cannot both allocate geometry rows.
    private static readonly SemaphoreSlim GeometryGate = new(1, 1);

    /// <summary>Replaces all detail groups and the AOI, or returns null when the package does not exist.</summary>
    /// <param name="id">The catalogue package identifier.</param>
    /// <param name="request">Esri JSON geometry groups; at least one detail group is required.</param>
    /// <param name="cancellationToken">Cancels validation and the geodatabase transaction before commit.</param>
    /// <returns>The updated package state, or null for an unknown identifier.</returns>
    /// <exception cref="InvalidDataException">The geometry request is invalid.</exception>
    /// <exception cref="InvalidOperationException">Geometry committed but the event could not be recorded.</exception>
    public async Task<PackageState?> ReplaceAsync(string id, AddPackageGeometryRequest request, CancellationToken cancellationToken) {
        if (request is null || string.IsNullOrWhiteSpace(request.Aoi) || (request.Points is null && request.Curves is null && request.Surfaces is null)) {
            throw new InvalidDataException("Supply Aoi and at least one of Points, Curves or Surfaces as Esri JSON strings.");
        }

        await GeometryGate.WaitAsync(cancellationToken);
        try {
            // Check existence without throwing an expected StreamNotFound exception in the debugger.
            if (!await eventStore.StreamExists(streamNameMap.GetStreamName(new PackageId(id)), cancellationToken)) { return null; }
            var stream = await eventStore.LoadState<PackageState, PackageId>(streamNameMap, new(id), true, cancellationToken);

            var absoluteUri = stream.State.AbsoluteUri?.AbsoluteUri ?? throw new InvalidOperationException($"Package '{id}' has no source URI.");
            var references = await dispatcher.ExecuteAsync(() => {
                cancellationToken.ThrowIfCancellationRequested();
                var geometry = Parse(request);
                return repository.AddPackageGeometries(geometry.Aoi, geometry.Points, geometry.Curves, geometry.Surfaces, id, absoluteUri, cancellationToken);
            });

            try {
                // These stores cannot share a transaction. Once ArcGIS commits, finish
                // recording the references even if the HTTP client has disconnected.
                var result = await commands.Handle(new PackagesCommands.ReplaceGeometry(id, references.Aoi, references.Details), CancellationToken.None);
                if (!result.Success) {
                    throw new InvalidOperationException($"Could not record geometry replacement for package '{id}'.");
                }
                logger.LogInformation("Replaced package geometry. PackageId: {PackageId}, Aoi: {Aoi}, Details: {@Details}.", id, references.Aoi, references.Details);
                return result.Get()!.State;
            }
            catch (Exception exception) {
                // Keep existing rows: old events still refer to them. Log newly committed
                // references so a failed event write can be diagnosed without losing data.
                logger.LogError(exception, "Geometry committed but package event persistence failed. PackageId: {PackageId}, Aoi: {Aoi}, Details: {@Details}", id, references.Aoi, references.Details);
                throw;
            }
        }
        finally {
            GeometryGate.Release();
        }
    }

    private static (Polygon Aoi, Multipoint? Points, Polyline? Curves, Polygon? Surfaces) Parse(AddPackageGeometryRequest request) {
        try {
            ValidateJson(request.Aoi, "Aoi", "rings", "curveRings");
            if (request.Points is not null) { ValidateJson(request.Points, "Points", "points"); }
            if (request.Curves is not null) { ValidateJson(request.Curves, "Curves", "paths", "curvePaths"); }
            if (request.Surfaces is not null) { ValidateJson(request.Surfaces, "Surfaces", "rings", "curveRings"); }

            var aoi = PolygonBuilderEx.FromJson(request.Aoi);
            var points = request.Points is null ? null : MultipointBuilderEx.FromJson(request.Points);
            var curves = request.Curves is null ? null : PolylineBuilderEx.FromJson(request.Curves);
            var surfaces = request.Surfaces is null ? null : PolygonBuilderEx.FromJson(request.Surfaces);
            Geometry?[] geometries = [aoi, points, curves, surfaces];
            foreach (var geometry in geometries.OfType<Geometry>()) {
                if (geometry.IsEmpty || geometry.SpatialReference is null) {
                    throw new InvalidDataException("Each supplied geometry must be nonempty and have a spatial reference.");
                }
                var extent = geometry.Extent;
                if (!double.IsFinite(extent.XMin) || !double.IsFinite(extent.YMin) || !double.IsFinite(extent.XMax) || !double.IsFinite(extent.YMax)) {
                    throw new InvalidDataException("Geometry coordinates must be finite.");
                }
            }
            if (aoi.Extent.Width <= 0 || aoi.Extent.Height <= 0) {
                throw new InvalidDataException("Aoi must have a nonzero width and height for point and line coverage.");
            }
            return (aoi, points, curves, surfaces);
        }
        catch (Exception exception) when (exception is System.Text.Json.JsonException or GeometryObjectException or ArgumentException) {
            throw new InvalidDataException("Invalid Esri geometry JSON. Aoi and Surfaces require polygons, Points requires a multipoint, and Curves requires a polyline.", exception);
        }
    }

    private static void ValidateJson(string json, string name, params string[] coordinateProperties) {
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("spatialReference", out var spatialReference) || spatialReference.ValueKind != JsonValueKind.Object
            || !coordinateProperties.Any(property => root.TryGetProperty(property, out var coordinates) && coordinates.ValueKind == JsonValueKind.Array && coordinates.GetArrayLength() > 0)) {
            throw new InvalidDataException($"{name} must be Esri geometry JSON with coordinates and an explicit spatialReference.");
        }
        if (!spatialReference.TryGetProperty("wkid", out _) && !spatialReference.TryGetProperty("wkt", out _)) {
            throw new InvalidDataException($"{name}.spatialReference must contain wkid or wkt.");
        }
    }
}
