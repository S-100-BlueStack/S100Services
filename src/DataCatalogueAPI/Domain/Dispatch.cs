using Eventuous;
using Microsoft.AspNetCore.Http.HttpResults;
using static DataCatalague.Api.Domain.Events.DispatcherEvents;
using static DataCatalague.Api.Domain.Events.DispatcherEvents.V1;

namespace DataCatalague.Api.Domain
{
    public class Category : Aggregate<CategoryState>
    {
        public async Task Create(
                    string CategoryId,
                    string DisplayName,
                    string? Description, string Prefix
            ) {
            this.EnsureDoesntExist();
            this.Apply(new V1.CategoryCreated(CategoryId, DisplayName, Description, DateTime.UtcNow, Prefix));
        }

        public async Task UpdateSpecification(
                    string Version,
                    string Markdown
            ) {
            this.EnsureExists();
            this.Apply(new V1.CategorySpecificationUpdated(Version, Markdown, DateTime.UtcNow));
        }
    }

    public record CategoryId(string Value) : Id(Value);

    public record CategoryState : State<CategoryState>
    {
        public CategoryId? Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string Prefix { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;

        public Version? Version { get; set; } = null;

        public string? Markdown { get; set; } = null;

        public bool IsTerminated { get; set; }

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public CategoryState() {
            this.On<V1.CategoryCreated>(Created);
            this.On<V1.CategorySpecificationUpdated>(UpdateSpecification);
        }

        static CategoryState Created(CategoryState state, V1.CategoryCreated e)
            => state with {
                Id = new(e.CategoryId),
                DisplayName = e.DisplayName,
                Prefix = e.Prefix ?? string.Empty,
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


    public class Binding : Aggregate<BindingState> {
        public async Task Create(
                    string BindingId,
                    string PackageId,
                    string PipelineId                   
            ) {
            this.EnsureDoesntExist();
            this.Apply(new V1.Binded(BindingId, PackageId, PipelineId, DateTime.UtcNow));
        }

        public Task Restore() {
            this.EnsureExists();
            if (this.State.IsActive) { throw new InvalidOperationException("Package is already assigned to this pipeline."); }
            this.Apply(new V1.Binded(this.State.Id!.Value, this.State.PackageId!.Value, this.State.PipelineId!.Value, DateTimeOffset.UtcNow));
            return Task.CompletedTask;
        }

        public Task Remove() {
            this.EnsureExists();
            if (this.State.IsActive) {
                this.Apply(new V1.Unbound(this.State.Id!.Value, this.State.PackageId!.Value, this.State.PipelineId!.Value, DateTimeOffset.UtcNow));
            }
            return Task.CompletedTask;
        }
    }

    public record BindingId(string Value) : Id(Value);

    public record BindingState : State<BindingState> {
        public bool IsActive { get; init; }
        public BindingId? Id { get; set; }

        public PackageId? PackageId { get; set; }

        public PipelineId? PipelineId { get; set; }

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public BindingState() {
            this.On<V1.Binded>(Binded);
            this.On<V1.Unbound>((state, e) => state with { IsActive = false, LastUpdatedUtc = e.UTC });
        }

        static BindingState Binded(BindingState state, V1.Binded e)
            => state with {
                IsActive = true,
                Id = new(e.BindingId),
                PackageId = new(e.PackageId),
                PipelineId = new(e.PipelineId),
                LastUpdatedUtc =e.UTC,
            };
    }
}

namespace DataCatalague.Api.Domain.Commands
{

    public static class DispatcherCommands
    {
        public record CreateCategory(string CategoryId, string DisplayName, string? Description, string Prefix);

        public record UpdateSpecificationCategory(string CategoryId, string Version, string Markdown);

        public record Bind(string BindingId, string PackageId, string PipelineId);

        public record RestoreBinding(string BindingId);

        public record Unbind(string BindingId);
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
                    DateTimeOffset UTC,
                    string? Prefix = null
                );

            [EventType("V1.CategorySpecificationUpdated")]
            public record CategorySpecificationUpdated(
                    string Version,
                    string Markdown,
                    DateTimeOffset UTC
                );


            [EventType("V1.Unbound")]
            public record Unbound(string BindingId, string PackageId, string PipelineId, DateTimeOffset UTC);

            [EventType("V1.Binded")]
            public record Binded(
                    string BindingId,
                    string PackageId,
                    string PipelineId,
                    DateTimeOffset UTC
                );
        }
    }
}
