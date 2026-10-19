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
                    (package, cmd, _) => package.CreatePackage(cmd.PackageId, cmd.Category, cmd.FileName, cmd.AbsoluteUri, cmd.GeometryRef, cmd.Severity, cmd.MetaData, cmd.DisplayScale, cmd.DetailedGeometry, cmd.CategoryData)
                );

            this.On<PackagesCommands.AddDetailedGeometry>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync(
                    (package, cmd, _) => package.AddDetailedGeometry(cmd.PointRef, cmd.CurveRef, cmd.SurfaceRef, cmd.PointRefs)
                );

            this.On<PackagesCommands.ReplaceGeometry>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync((package, cmd, _) => package.ReplaceGeometry(cmd.Aoi, cmd.Details, cmd.Fingerprint));

            this.On<PackagesCommands.UpdateSeverity>()
                .InState(ExpectedState.Existing)
                .GetId(cmd => new(cmd.PackageId))
                .ActAsync(
                    (package, cmd, _) => package.UpdateSeverity(cmd.Severity)
                );
        }
    }
}
