using Eventuous;
using static DataCatalague.Api.Domain.PipelineEvents;

namespace DataCatalague.Api.Domain
{
    public record PipelineId(string Value) : Id(Value);

    public record PipelineState : State<PipelineState>
    {
        public Guid Uuid { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string Description { get; set; } = string.Empty;

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PipelineState() {
            On<V1.PipelineCreated>(Created);
        }

        static PipelineState Created(PipelineState state, V1.PipelineCreated e)
            => state with {
                Uuid = e.Uuid,
                DisplayName = e.DisplayName,
                Description = e.Description,
                LastUpdatedUtc = e.CreatedUTC,
            };
    }

    public class Pipeline : Aggregate<PipelineState>
    {
        public async Task Create(
                    Guid Uuid,
                    string DisplayName,
                    string Description
            ) {
            EnsureDoesntExist();
            Apply(new V1.PipelineCreated(Uuid, DisplayName, Description, DateTime.UtcNow));
        }
    }

    public static class PipelineCommands
    {
        public record Create(Guid Uuid, string DisplayName, string? Description = default);
    }

    public static class PipelineEvents
    {
        public static class V1
        {
            [EventType("V1.Created")]
            public record PipelineCreated(
                    Guid Uuid,
                    string DisplayName,
                    string Description,
                    DateTimeOffset CreatedUTC
                );

            [EventType("V1.WorkspaceAdded")]
            public record WorkspaceAdded(
                );
        }
    }

    public static class PipelineExtension {
        public static PipelineId ToPipelineId(this Guid uuid) => new PipelineId(uuid.ToString("B"));
    }
}
