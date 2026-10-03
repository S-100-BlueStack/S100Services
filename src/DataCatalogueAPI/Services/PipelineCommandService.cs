using DataCatalague.Api.Domain;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class PipelineCommandService : CommandService<Pipeline, PipelineState, PipelineId>
    {
        public PipelineCommandService(IEventStore store) : base(store) {
            On<PipelineCommands.Create>()
                .InState(ExpectedState.New)
                .GetId(cmd => cmd.Uuid.ToPipelineId())
                .ActAsync(
                    (pipeline, cmd, _) => pipeline.Create(cmd.Uuid, cmd.DisplayName, cmd.Description)
                );
        }
    }
}
