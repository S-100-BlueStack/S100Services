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

    public class PackageCommandService : CommandService<Package, PackageState, PackageId>
    {
        public PackageCommandService(IEventStore store) : base(store) {
            this.On<DispatcherCommands.CreatePackage>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync(
                    (package, cmd, _) => package.CreatePackage(cmd.PackageId, cmd.Category, cmd.FileName, cmd.AbsoluteUri, cmd.GeometryRef, cmd.ShortId, cmd.Type, cmd.Number, cmd.Title, cmd.Source, cmd.RefId, cmd.CreatedUTC)
                );
        }
    }
}
