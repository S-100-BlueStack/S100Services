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

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public bool IsTerminated { get; set; }

        public PackageTypeState() {
            this.On<V1.PackageTypeCreated>(Created);
        }

        static PackageTypeState Created(PackageTypeState state, V1.PackageTypeCreated e)
            => state with {
                Id = new(e.PackageTypeId),
                DisplayName = e.DisplayName,
                Description = e.Description,
                LastUpdatedUtc = e.CreatedUTC,
                IsTerminated = false,
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
                LastUpdatedUtc = e.CreatedUTC,                
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
                    DateTimeOffset CreatedUTC
                );

            [EventType("V1.PackageCreated")]
            public record PackageCreated(
                    string PackageId,
                    string PackageTypeId,
                    string FileName,
                    string AbsoluteUri,
                    string GeometryRef,
                    DateTimeOffset CreatedUTC
                );
        }
    }
}
