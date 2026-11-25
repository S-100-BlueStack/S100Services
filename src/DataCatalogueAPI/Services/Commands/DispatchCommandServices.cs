using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using Eventuous;

namespace DataCatalague.Api.Services.Commands
{
    public class CategoryCommandService : CommandService<Domain.Category, CategoryState, CategoryId>
    {
        public CategoryCommandService(IEventStore store) : base(store) {
            this.On<DispatcherCommands.CreateCategory>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.CategoryId))
                .ActAsync(
                    (category, cmd, _) => category.Create(cmd.CategoryId, cmd.DisplayName, cmd.Description, cmd.Prefix, cmd.AutomaticPipelineIds)
                );

            this.On<DispatcherCommands.UpdateAutomaticPipelines>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.CategoryId))
                .ActAsync((category, cmd, _) => category.UpdateAutomaticPipelines(cmd.PipelineIds));

            this.On<DispatcherCommands.UpdateSpecificationCategory>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.CategoryId))
                .ActAsync(
                    (category, cmd, _) => category.UpdateSpecification(cmd.Version, cmd.Markdown)
                );
        }
    }

    public class BindingCommandService : CommandService<Domain.Binding, BindingState, BindingId>
    {
        public BindingCommandService(IEventStore store) : base(store) {
            this.On<DispatcherCommands.Bind>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.BindingId))
                .ActAsync(
                    (binding, cmd, _) => binding.Create(cmd.BindingId, cmd.PackageId, cmd.PipelineId, cmd.Actor)
                );
            this.On<DispatcherCommands.RestoreBinding>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.BindingId))
                .ActAsync((binding, cmd, _) => binding.Restore(cmd.Actor));
            this.On<DispatcherCommands.Unbind>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.BindingId))
                .ActAsync((binding, cmd, _) => binding.Remove(cmd.Actor));
            this.On<DispatcherCommands.AddBindingComment>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.BindingId))
                .ActAsync((binding, cmd, _) => binding.AddComment(cmd.OperationId, cmd.Text, cmd.Actor));
        }
    }
}
