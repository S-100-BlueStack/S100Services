using Eventuous;
using static DataCatalague.Api.Domain.Events.PackagesEvents;


namespace DataCatalague.Api.Domain
{
    public record DisplayScale(long maximumDisplayScale = 1, long minimumDisplayScale = 19999999);

    /// <summary>References to the complete detail geometries, separate from the package AOI.</summary>
    /// <param name="PointRef">The point geometry reference when stored as exactly one feature; otherwise null.</param>
    /// <param name="CurveRef">The multipart curve reference, if present.</param>
    /// <param name="SurfaceRef">The polygon reference, if present.</param>
    public record DetailedGeometry(string? PointRef, string? CurveRef, string? SurfaceRef)
    {
        /// <summary>All point feature references; a Multipoint feature contributes one reference.</summary>
        public IReadOnlyList<string> PointRefs { get; init; } = PointRef is null ? [] : [PointRef];
    }

    /// <summary>A package description mapped from source text, with its original HTML unchanged.</summary>
    /// <param name="PartIndex">The source notice part's indexNo, or null for sources without parts.</param>
    /// <param name="Language">The source language code, or null when unspecified.</param>
    /// <param name="Description">The source description, including its HTML markup.</param>
    public record PackageDescription(string? Language, string Description);

    /// <summary>A related chart, preserving the association between national and international numbers.</summary>
    /// <param name="ChartNumber">The source chart number as text, including any leading zeroes.</param>
    /// <param name="InternationalNumber">The international chart number, if supplied.</param>
    public record PackageChart(string? ChartNumber, long? InternationalNumber);

    public record PackageMetaData(string? ShortId, string? Type, string? Title, string? Source, string? RefId, DateTimeOffset? CreatedUTC);
}

namespace DataCatalague.Api.Domain
{  
    public class Package : Aggregate<PackageState>
    {
        public async Task CreatePackage(
                    string PackageId,
                    string Category,
                    string FileName,
                    string AbsoluteUri,
                    string GeometryRef,
                    ulong Severity,
                    PackageMetaData? MetaData,
                    DisplayScale? DisplayScale, DetailedGeometry? DetailedGeometry = null, PackageDescription[]? Descriptions = null, PackageChart[]? Charts = null) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PackageCreated(PackageId, Category, FileName, AbsoluteUri, GeometryRef, MetaData, DisplayScale, DateTime.UtcNow, Descriptions, Charts));
            this.Apply(new V1.SeverityUpdated(Severity, DateTime.UtcNow));
            if (DetailedGeometry is not null) {
                this.Apply(new V1.DetailedGeometryAdded(DetailedGeometry.PointRef, DetailedGeometry.CurveRef, DetailedGeometry.SurfaceRef, DateTime.UtcNow, DetailedGeometry.PointRefs.ToArray()));
            }
        }

        /// <summary>Records the AOI and detail references together so replay cannot expose mismatched geometries.</summary>
        public Task ReplaceGeometry(string aoi, DetailedGeometry details) {
            this.EnsureExists();
            this.Apply(new V1.GeometryReplaced(aoi, details, DateTimeOffset.UtcNow));
            return Task.CompletedTask;
        }

        public Task AddDetailedGeometry(string? PointRef, string? CurveRef, string? SurfaceRef, IReadOnlyList<string>? PointRefs = null) {
            this.EnsureExists();
            this.Apply(new V1.DetailedGeometryAdded(PointRef, CurveRef, SurfaceRef, DateTime.UtcNow, PointRefs?.ToArray()));
            return Task.CompletedTask;
        }

        public async Task UpdateSeverity(
                    ulong Severity
            ) {
            this.EnsureExists();
            this.Apply(new V1.SeverityUpdated(Severity, DateTime.UtcNow));
        }
    }

    public record PackageId(string Value) : Id(Value);

    public record PackageState : State<PackageState>
    {
        public PackageId? Id { get; set; }

        public CategoryId? Category { get; set; }

        public string FileName { get; set; } = string.Empty;

        public Uri? AbsoluteUri { get; set; }

        public string? GeometryRef { get; set; }

        public ulong? Severity { get; set; } = ulong.MaxValue;

        /// <summary>The complete geometries referenced by the latest DetailedGeometryAdded event.</summary>
        public DetailedGeometry? DetailedGeometry { get; init; }

        public PackageMetaData? MetaData { get; set; } = null;

        /// <summary>Source descriptions, preserving each part/language entry and its original HTML.</summary>
        public PackageDescription[]? Descriptions { get; init; }

        /// <summary>Related charts, or null when the source has no chart references.</summary>
        public PackageChart[]? Charts { get; init; }

        public DisplayScale? DisplayScale { get; init; } = null;

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PackageState() {
            this.On<V1.PackageCreated>(PackageCreated);
            this.On<V1.GeometryReplaced>((state, e) => state with { GeometryRef = e.Aoi, DetailedGeometry = e.Details, LastUpdatedUtc = e.UTC });
            this.On<V1.SeverityUpdated>((state, e) => state with { Severity = e.Severity, LastUpdatedUtc = e.UTC });
            this.On<V1.DetailedGeometryAdded>((state, e) => state with { DetailedGeometry = new(e.PointRef, e.CurveRef, e.SurfaceRef) { PointRefs = e.PointRefs?.ToArray() ?? (e.PointRef is null ? [] : [e.PointRef]) }, LastUpdatedUtc = e.UTC });
        }

        static PackageState PackageCreated(PackageState state, V1.PackageCreated e)
            => state with {
                Id = new(e.PackageId),
                Category = new(e.Category),
                FileName = e.FileName,
                AbsoluteUri = new(e.AbsoluteUri),
                GeometryRef = e.GeometryRef,
                MetaData = e.MetaData,
                Descriptions = e.Descriptions,
                Charts = e.Charts,
                DisplayScale = e.DisplayScale,
                LastUpdatedUtc = e.UTC,
            };
    }
}

namespace DataCatalague.Api.Domain.Commands
{

    public static class PackagesCommands
    {
        public record CreatePackage(string PackageId, string Category, string FileName, string AbsoluteUri, string GeometryRef, ulong Severity, PackageMetaData? MetaData, DisplayScale? DisplayScale, DetailedGeometry? DetailedGeometry = null, PackageDescription[]? Descriptions = null, PackageChart[]? Charts = null);

        public record AddDetailedGeometry(string PackageId, string? PointRef, string? CurveRef, string? SurfaceRef, IReadOnlyList<string>? PointRefs = null);

        /// <summary>Replaces the complete geometry reference set of an existing package.</summary>
        public record ReplaceGeometry(string PackageId, string Aoi, DetailedGeometry Details);

        public record UpdateSeverity(string PackageId, ulong Severity);
    }
}

namespace DataCatalague.Api.Domain.Events
{
    public static class PackagesEvents
    {
        public static class V1
        {
            [EventType("V1.PackageCreated")]
            public record PackageCreated(
                    string PackageId,
                    string Category,
                    string FileName,
                    string AbsoluteUri,
                    string GeometryRef,
                    PackageMetaData? MetaData,
                    DisplayScale? DisplayScale,
                    DateTimeOffset UTC,
                    PackageDescription[]? Descriptions = null, PackageChart[]? Charts = null
                );

            [EventType("V1.DetailedGeometryAdded")]
            public record DetailedGeometryAdded(string? PointRef, string? CurveRef, string? SurfaceRef, DateTimeOffset UTC, IReadOnlyList<string>? PointRefs = null);

            /// <summary>The complete geometry reference set committed by a replacement request.</summary>
            [EventType("V1.GeometryReplaced")]
            public record GeometryReplaced(string Aoi, DetailedGeometry Details, DateTimeOffset UTC);

            [EventType("V1.SeverityUpdated")]
            public record SeverityUpdated(
                    ulong Severity,
                    DateTimeOffset UTC
                );
        }
    }
}
