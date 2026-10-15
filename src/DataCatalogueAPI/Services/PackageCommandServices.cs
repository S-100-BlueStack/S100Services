using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class PackageCommandService : CommandService<Package, PackageState, PackageId>
    {
        public PackageCommandService(IEventStore store) : base(store) {
            this.On<PackagesCommands.CreatePackage>()
                .InState(ExpectedState.New)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync(
                    (package, cmd, _) => package.CreatePackage(cmd.PackageId, cmd.Category, cmd.FileName, cmd.AbsoluteUri, cmd.GeometryRef, cmd.Severity, cmd.MetaData, cmd.DisplayScale)
                );

            this.On<PackagesCommands.AddDetailedGeometry>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync(
                    (package, cmd, _) => package.AddDetailedGEometry(cmd.PointRef, cmd.CurveRef, cmd.SurfaceRef)
                );

            this.On<PackagesCommands.UpdateSeverity>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync(
                    (package, cmd, _) => package.UpdateSeverity(cmd.Severity)
                );
        }
    }
}
