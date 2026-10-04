using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class StreamCommandService : CommandService<Domain.PackageType, PackageTypeState, PackageTypeId>
    {
        public StreamCommandService(IEventStore store) : base(store) {
            this.On<DispatcherCommands.CreatePackageType>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.PackageTypeId))
                .ActAsync(
                    (counter, cmd, _) => counter.Create(cmd.PackageTypeId, cmd.DisplayName, cmd.Description)
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
                    (package, cmd, _) => package.CreatePackage(cmd.PackageId, cmd.PackageTypeId, cmd.FileName, cmd.AbsoluteUri, cmd.GeometryRef)
                );
        }
    }
}
