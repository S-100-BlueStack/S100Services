using Eventuous;
using static DataCatalague.Api.Domain.PipelineEvents;

namespace DataCatalague.Api.Domain
{
    public record Workspace(string DisplayName, DisplayScale DisplayScale, string GeometryRef);

    public record PipelineId(string Value) : Id(Value);

    public record PipelineState : State<PipelineState>
    {
        public PipelineId? Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;

        public Workspace[] Workspaces = [];

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PipelineState() {
            this.On<V1.PipelineCreated>(Created);
            this.On<V1.WorkspaceAdded>(WorkspaceAdded);
        }

        static PipelineState Created(PipelineState state, V1.PipelineCreated e)
            => state with {
                Id = new(e.PipelineId),
                DisplayName = e.DisplayName,
                Description = e.Description,
                LastUpdatedUtc = e.CreatedUTC,
            };

        static PipelineState WorkspaceAdded(PipelineState state, V1.WorkspaceAdded e)
            => state with {
                Workspaces = [.. state.Workspaces, new(e.DisplayName, e.DisplayScale, e.GeometryRef)],
                LastUpdatedUtc = e.UTC,
            };
    }

    public class Pipeline : Aggregate<PipelineState>
    {
        public async Task Create(
                    string PipelineId,
                    string DisplayName,
                    string? Description
            ) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PipelineCreated(PipelineId, DisplayName, Description, DateTime.UtcNow));
        }

        public async Task CreateWorkspace(
                    string DisplayName,
                    DisplayScale DisplayScale,
                    string GeometryRef
            ) {
            this.EnsureExists();
            this.Apply(new V1.WorkspaceAdded(DisplayName, DisplayScale, GeometryRef, DateTime.UtcNow));
        }
    }

    public static class PipelineCommands
    {
        public record Create(string PipelineId, string DisplayName, string? Description = default);

        public record CreateWorkspace(string PipelineId, string DisplayName, DisplayScale DisplayScale, string GeometryRef);
    }

    public static class PipelineEvents
    {
        public static class V1
        {
            [EventType("V1.PipelineCreated")]
            public record PipelineCreated(
                    string PipelineId,
                    string DisplayName,
                    string? Description,
                    DateTimeOffset CreatedUTC
                );

            [EventType("V1.WorkspaceAdded")]
            public record WorkspaceAdded(
                    string DisplayName,
                    DisplayScale DisplayScale,
                    string GeometryRef,
                    DateTimeOffset UTC
                );
        }
    }

    public static class PipelineExtension
    {
    }
}
