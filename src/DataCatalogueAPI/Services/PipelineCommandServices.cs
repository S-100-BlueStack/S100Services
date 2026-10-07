using DataCatalague.Api.Domain;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class PipelineCommandService : CommandService<Pipeline, PipelineState, PipelineId>
    {
        public PipelineCommandService(IEventStore store) : base(store) {
            this.On<PipelineCommands.Create>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.PipelineId))
                .ActAsync(
                    (pipeline, cmd, _) => pipeline.Create(cmd.PipelineId, cmd.DisplayName, cmd.Description)
                );

            this.On<PipelineCommands.CreateWorkspace>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.PipelineId))
                .ActAsync(
                    (pipeline, cmd, _) => pipeline.CreateWorkspace(cmd.DisplayName, cmd.DisplayScale, cmd.GeometryRef)
                );
        }
    }
}
