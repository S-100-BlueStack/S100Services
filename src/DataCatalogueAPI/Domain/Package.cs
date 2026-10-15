using Eventuous;
using static DataCatalague.Api.Domain.Events.PackagesEvents;


namespace DataCatalague.Api.Domain
{
    public record DisplayScale(long maximumDisplayScale = 1, long minimumDisplayScale = 19999999);

    public record PackageMetaData(string? ShortId, string? Type, long? Number, string? Title, string? Source, string? RefId, DateTimeOffset? CreatedUTC);
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
                    DisplayScale? DisplayScale) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PackageCreated(PackageId, Category, FileName, AbsoluteUri, GeometryRef, MetaData, DisplayScale, DateTime.UtcNow));
            this.Apply(new V1.SeverityUpdated(Severity, DateTime.UtcNow));
        }

        public async Task AddDetailedGEometry(
                    string? PointRef,
                    string? CurveRef,
                    string? SurfaceRef
            ) {
            this.EnsureExists();
            this.Apply(new V1.DetailedGeometryAdded(PointRef, CurveRef, SurfaceRef, DateTime.UtcNow));
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

        public PackageMetaData? MetaData { get; set; } = null;

        public DisplayScale? DisplayScale { get; init; } = null;

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PackageState() {
            this.On<V1.PackageCreated>(PackageCreated);
        }

        static PackageState PackageCreated(PackageState state, V1.PackageCreated e)
            => state with {
                Id = new(e.PackageId),
                Category = new(e.Category),
                FileName = e.FileName,
                AbsoluteUri = new(e.AbsoluteUri),
                GeometryRef = e.GeometryRef,
                MetaData = e.MetaData,
                DisplayScale = e.DisplayScale,
                LastUpdatedUtc = e.UTC,
            };
    }
}

namespace DataCatalague.Api.Domain.Commands
{

    public static class PackagesCommands
    {
        public record CreatePackage(string PackageId, string Category, string FileName, string AbsoluteUri, string GeometryRef, ulong Severity, PackageMetaData? MetaData, DisplayScale? DisplayScale);

        public record AddDetailedGeometry(string PackageId, string? PointRef, string? CurveRef, string? SurfaceRef);

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
                    DateTimeOffset UTC
                );

            [EventType("V1.DetailedGeometryAdded")]
            public record DetailedGeometryAdded(
                    string? PointRef,
                    string? CurveRef,
                    string? SurfaceRef,
                    DateTimeOffset UTC
                );

            [EventType("V1.SeverityUpdated")]
            public record SeverityUpdated(
                    ulong Severity,
                    DateTimeOffset UTC
                );
        }
    }
}
