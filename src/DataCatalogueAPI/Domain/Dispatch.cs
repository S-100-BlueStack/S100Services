using Eventuous;
using static DataCatalague.Api.Domain.Events.DispatcherEvents;


namespace DataCatalague.Api.Domain
{
    public record DisplayScale(long maximumDisplayScale = 1, long minimumDisplayScale = 19999999);

    public record PackageMetaData(string? ShortId, string? Type, long? Number, string? Title, string? Source, string? RefId, DateTimeOffset? CreatedUTC);
}

namespace DataCatalague.Api.Domain
{
    public class Category : Aggregate<CategoryState>
    {
        public async Task Create(
                    string CategoryId,
                    string DisplayName,
                    string? Description
            ) {
            this.EnsureDoesntExist();
            this.Apply(new V1.CategoryCreated(CategoryId, DisplayName, Description, DateTime.UtcNow));
        }

        public async Task UpdateSpecification(
                    string Version,
                    string Markdown
            ) {
            this.EnsureExists();
            this.Apply(new V1.CategorySpecificationUpdated(Version, Markdown, DateTime.UtcNow));
        }
    }

    public class Package : Aggregate<PackageState>
    {
        public async Task CreatePackage(
                    string PackageId,
                    string Category,
                    string FileName,
                    string AbsoluteUri,
                    string GeometryRef,
                    PackageMetaData? MetaData,
                    DisplayScale? DisplayScale) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PackageCreated(PackageId, Category, FileName, AbsoluteUri, GeometryRef, MetaData, DisplayScale, DateTime.UtcNow));
        }
    }


    public record CategoryId(string Value) : Id(Value);

    public record CategoryState : State<CategoryState>
    {
        public CategoryId? Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;

        public Version? Version { get; set; } = null;

        public string? Markdown { get; set; } = null;

        public bool IsTerminated { get; set; }

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public CategoryState() {
            this.On<V1.CategoryCreated>(Created);
        }

        static CategoryState Created(CategoryState state, V1.CategoryCreated e)
            => state with {
                Id = new(e.CategoryId),
                DisplayName = e.DisplayName,
                Description = e.Description,
                IsTerminated = false,
                LastUpdatedUtc = e.UTC,
            };

        static CategoryState UpdateSpecification(CategoryState state, V1.CategorySpecificationUpdated e)
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

        public CategoryId? Category { get; set; }

        public string FileName { get; set; } = string.Empty;

        public Uri? AbsoluteUri { get; set; }

        public string? GeometryRef { get; set; }

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

    public static class DispatcherCommands
    {
        public record CreateCategory(string CategoryId, string DisplayName, string? Description = default);

        public record UpdateSpecificationCategory(string CategoryId, string Version, string Markdown);

        public record CreatePackage(string PackageId, string Category, string FileName, string AbsoluteUri, string GeometryRef, PackageMetaData? MetaData, DisplayScale? DisplayScale);
    }

}

namespace DataCatalague.Api.Domain.Events
{
    public static class DispatcherEvents
    {
        public static class V1
        {
            [EventType("V1.CategoryCreated")]
            public record CategoryCreated(
                    string CategoryId,
                    string DisplayName,
                    string? Description,
                    DateTimeOffset UTC
                );

            [EventType("V1.CategorySpecificationUpdated")]
            public record CategorySpecificationUpdated(
                    string Version,
                    string Markdown,
                    DateTimeOffset UTC
                );

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
        }
    }
}
