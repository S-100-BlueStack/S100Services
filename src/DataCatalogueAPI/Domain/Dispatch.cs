using Eventuous;
using static DataCatalague.Api.Domain.Events.DispatcherEvents;

namespace DataCatalague.Api.Domain
{
    public class PackageType : Aggregate<PackageTypeState>
    {
        public async Task Create(
                    string PackageTypeId,
                    string DisplayName,
                    string? Description
            ) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PackageTypeCreated(PackageTypeId, DisplayName, Description, DateTime.UtcNow));
        }

        public async Task UpdateSpecification(
                    string Version,
                    string Markdown
            ) {
            this.EnsureExists();
            this.Apply(new V1.PackageTypeSpecificationUpdated(Version, Markdown, DateTime.UtcNow));
        }
    }

    public class Package : Aggregate<PackageState>
    {
        public async Task CreatePackage(
                    string PackageId,
                    string PackageTypeId, 
                    string FileName, 
                    string AbsoluteUri,
                    string GeometryRef) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PackageCreated(PackageId, PackageTypeId, FileName, AbsoluteUri, GeometryRef, DateTime.UtcNow));
        }
    }


    public record PackageTypeId(string Value) : Id(Value);

    public record PackageTypeState : State<PackageTypeState>
    {
        public PackageTypeId? Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;        

        public Version? Version { get; set; } = null;

        public string? Markdown { get; set; } = null;

        public bool IsTerminated { get; set; }

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PackageTypeState() {
            this.On<V1.PackageTypeCreated>(Created);
        }

        static PackageTypeState Created(PackageTypeState state, V1.PackageTypeCreated e)
            => state with {
                Id = new(e.PackageTypeId),
                DisplayName = e.DisplayName,
                Description = e.Description,                
                IsTerminated = false,
                LastUpdatedUtc = e.UTC,
            };

        static PackageTypeState UpdateSpecification(PackageTypeState state, V1.PackageTypeSpecificationUpdated e)
            => state with {
                Version = new Version(e.Version),
                Markdown = e.Markdown,
                LastUpdatedUtc = e.UTC,
            };
    }

    public record PackageId(string Value) : Id(Value);

    public record PackageState : State<PackageState>
    {
        public PackageId? Id { get; set; }

        public PackageTypeId? PackageTypeId { get; set; }

        public string FileName { get; set; } = string.Empty;

        public Uri? Uri { get; set; }

        public string? GeometryRef { get; set; }

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PackageState() {
            this.On<V1.PackageCreated>(PackageCreated);
        }

        static PackageState PackageCreated(PackageState state, V1.PackageCreated e)
            => state with {
                Id = new(e.PackageId),
                PackageTypeId = new(e.PackageTypeId),
                FileName = e.FileName,
                Uri = new(e.AbsoluteUri),
                GeometryRef = e.GeometryRef,
                LastUpdatedUtc = e.UTC,                
            };
    }

    public static class Extension
    {        
    }
}

namespace DataCatalague.Api.Domain.Commands
{

    public static class DispatcherCommands
    {
        public record CreatePackageType(string PackageTypeId, string DisplayName, string? Description = default);

        public record UpdateSpecificationPackageType(string PackageTypeId, string Version, string Markdown);

        public record CreatePackage(string PackageId, string PackageTypeId, string FileName, string AbsoluteUri, string GeometryRef);
    }

}

namespace DataCatalague.Api.Domain.Events
{
    public static class DispatcherEvents
    {
        public static class V1
        {
            [EventType("V1.PackageTypeCreated")]
            public record PackageTypeCreated(
                    string PackageTypeId,
                    string DisplayName,
                    string? Description,
                    DateTimeOffset UTC
                );

            [EventType("V1.PackageTypeSpecificationUpdated")]
            public record PackageTypeSpecificationUpdated(
                    string Version,
                    string Markdown,
                    DateTimeOffset UTC
                );

            [EventType("V1.PackageCreated")]
            public record PackageCreated(
                    string PackageId,
                    string PackageTypeId,
                    string FileName,
                    string AbsoluteUri,
                    string GeometryRef,
                    DateTimeOffset UTC
                );
        }
    }
}
