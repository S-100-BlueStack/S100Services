using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class CategoryCommandService : CommandService<Domain.Category, CategoryState, CategoryId>
    {
        public CategoryCommandService(IEventStore store) : base(store) {
            this.On<DispatcherCommands.CreateCategory>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.CategoryId))
                .ActAsync(
                    (category, cmd, _) => category.Create(cmd.CategoryId, cmd.DisplayName, cmd.Description)
                );

            this.On<DispatcherCommands.UpdateSpecificationCategory>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.CategoryId))
                .ActAsync(
                    (category, cmd, _) => category.UpdateSpecification(cmd.Version, cmd.Markdown)
                );
        }
    }    
}
