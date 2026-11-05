using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI;

/// <summary>Verifies that delivery Pause changes package presentation while preserving candidate outcomes.</summary>
public sealed class EncPackagePauseStatusTests
{
    /// <summary>Either failed member remains intact while Pause overrides Error and Resume reveals it again.</summary>
    /// <param name="failedSpecification">The product whose candidate failed validation.</param>
    /// <returns>A task completing after both action snapshots and the preserved diagnostics are verified.</returns>
    [Theory]
    [InlineData(ProductSpecification.S57)]
    [InlineData(ProductSpecification.S101)]
    public async Task PauseAndResumePreserveTheFailedCandidate(ProductSpecification failedSpecification) {
        var fixture = await DpcRunFixture.CreatedPackageAsync();
        var package = fixture.Packages.Active[DpcRunFixture.Source];
        var s57 = await fixture.TrackAsync(ProductSpecification.S57);
        var s101 = await fixture.TrackAsync(ProductSpecification.S101);
        var failed = failedSpecification == ProductSpecification.S57 ? s57 : s101;
        var ready = failedSpecification == ProductSpecification.S57 ? s101 : s57;
        failed.State = ProductState.Error;
        failed.ErrorCode = "SEVENCS_VALIDATION_FAILED";
        failed.ErrorMessage = "SevenCs found one critical finding.";
        package.ErrorMessage = "A candidate failed validation.";
        var candidateEdition = failed.CandidateEdition;
        var candidateUpdate = failed.CandidateUpdate;
        var control = new EncPackageControlState { PackageId = package.Id, SourceDatasetName = package.SourceDatasetName, IsPaused = true };
        var controls = DpcProxy<IEncPackageControlRepository>.Create((method, _) => method.Name == nameof(IEncPackageControlRepository.GetForPackageAsync)
            ? Task.FromResult<EncPackageControlState?>(control)
            : throw new NotSupportedException(method.Name));
        var environment = DpcProxy<IHostEnvironment>.Create((method, _) => method.Name == "get_EnvironmentName" ? "Production" : throw new NotSupportedException(method.Name));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["EncPackageActions:Enabled"] = "true" }).Build();
        var service = new EncPackageActionService(fixture.Packages, controls, fixture.Workflow, null!, configuration, environment, fixture.Clock);

        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(package, s57, s101));
        var paused = await service.ReadAsync(DpcRunFixture.Source);
        Assert.NotNull(paused);
        Assert.True(paused.Paused);
        Assert.True(paused.CanResume);
        Assert.Equal(EncPackageStatus.Hold, paused.Status);
        Assert.Equal(paused.Status, EncPackageStatusResolver.Resolve(package, s57, s101));
        Assert.Equal(failed.ErrorMessage, paused.ErrorMessage);

        control.IsPaused = false;
        var resumed = await service.ReadAsync(DpcRunFixture.Source);
        Assert.NotNull(resumed);
        Assert.False(resumed.Paused);
        Assert.True(resumed.CanPause);
        Assert.Equal(EncPackageStatus.Error, resumed.Status);
        Assert.Equal(resumed.Status, EncPackageStatusResolver.Resolve(package, s57, s101));
        Assert.Equal(failed.ErrorMessage, resumed.ErrorMessage);
        Assert.Equal(ProductState.Error, failed.State);
        Assert.Equal(ProductState.ReadyForDistribution, ready.State);
        Assert.Equal(candidateEdition, failed.CandidateEdition);
        Assert.Equal(candidateUpdate, failed.CandidateUpdate);
        Assert.Equal("SEVENCS_VALIDATION_FAILED", failed.ErrorCode);
        Assert.Equal("SevenCs found one critical finding.", failed.ErrorMessage);
        Assert.Equal("A candidate failed validation.", package.ErrorMessage);
    }

    /// <summary>A paused valid pair returns to Ready when its delivery Pause is removed.</summary>
    [Fact]
    public void PausedReadyPairReturnsToReadyAfterResume() {
        var package = new EncPackage { IsPaused = true };
        var s57 = new ProductExportTrackRecord { State = ProductState.ReadyForDistribution };
        var s101 = new ProductExportTrackRecord { State = ProductState.ReadyForDistribution };

        Assert.Equal(EncPackageStatus.Hold, EncPackageStatusResolver.Resolve(package, s57, s101));
        package.IsPaused = false;
        Assert.Equal(EncPackageStatus.Ready, EncPackageStatusResolver.Resolve(package, s57, s101));
    }
}
