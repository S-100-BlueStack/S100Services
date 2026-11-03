using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI;

/// <summary>Checks paired status precedence and the action response's use of the shared resolver.</summary>
public sealed class EncPackageAggregateResponseTests
{
    /// <summary>The result is independent of member order and cannot report a successful pair from one successful member.</summary>
    [Theory]
    [InlineData(ProductState.ReadyForDistribution, ProductState.ReadyForDistribution, EncPackageStatus.Ready)]
    [InlineData(ProductState.AcceptedForDistribution, ProductState.AcceptedForDistribution, EncPackageStatus.InTransit)]
    [InlineData(ProductState.Published, ProductState.Published, EncPackageStatus.Idle)]
    [InlineData(ProductState.Error, ProductState.ReadyForDistribution, EncPackageStatus.Error)]
    [InlineData(ProductState.Error, ProductState.InTransit, EncPackageStatus.Error)]
    [InlineData(ProductState.Rejected, ProductState.AcceptedForDistribution, EncPackageStatus.Error)]
    [InlineData(ProductState.Frozen, ProductState.Error, EncPackageStatus.Error)]
    [InlineData(ProductState.Frozen, ProductState.InTransit, EncPackageStatus.Hold)]
    [InlineData(ProductState.Exporting, ProductState.ReadyForDistribution, EncPackageStatus.Idle)]
    [InlineData(ProductState.Validating, ProductState.ReadyForDistribution, EncPackageStatus.Idle)]
    [InlineData(ProductState.InTransit, ProductState.ReadyForDistribution, EncPackageStatus.InTransit)]
    [InlineData(ProductState.InTransit, ProductState.AcceptedForDistribution, EncPackageStatus.InTransit)]
    [InlineData(ProductState.AcceptedForDistribution, ProductState.ReadyForDistribution, EncPackageStatus.InTransit)]
    [InlineData(ProductState.Published, ProductState.AcceptedForDistribution, EncPackageStatus.InTransit)]
    [InlineData(ProductState.Idle, ProductState.ReadyForDistribution, EncPackageStatus.Error)]
    [InlineData(ProductState.Cancelled, ProductState.ReadyForDistribution, EncPackageStatus.Idle)]
    public void MemberStatesHaveSymmetricPrecedence(ProductState first, ProductState second, EncPackageStatus expected) {
        var package = new EncPackage();
        Assert.Equal(expected, EncPackageStatusResolver.Resolve(package, new() { State = first }, new() { State = second }));
        Assert.Equal(expected, EncPackageStatusResolver.Resolve(package, new() { State = second }, new() { State = first }));
    }

    /// <summary>A discarded or absent export cannot count toward paired success.</summary>
    [Fact]
    public void BothMembersAreRequiredForSuccess() {
        var ready = new ProductExportTrackRecord { State = ProductState.ReadyForDistribution };
        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), null, ready));
        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new() { S57Discarded = true }, ready, ready));
        Assert.Equal(EncPackageStatus.Idle, EncPackageStatusResolver.Resolve(null, ready, ready));
        Assert.NotNull(EncPackageStatusResolver.GetErrorMessage(new() { S57Discarded = true }, ready, ready));
    }

    /// <summary>An active snapshot without candidate work is inconsistent, even if both tracks are idle.</summary>
    [Fact]
    public void ActivePackageWithoutCandidatesIsErrorButAbsentPackageIsIdle() {
        var idle = new ProductExportTrackRecord { State = ProductState.Idle };
        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), idle, idle));
        Assert.Equal(EncPackageStatus.Idle, EncPackageStatusResolver.Resolve(null, idle, idle));
        Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), null, new() { State = ProductState.Frozen }));
    }

    /// <summary>The repository cannot create a partially discarded package through its historical per-member entry point.</summary>
    [Theory]
    [InlineData(ProductSpecification.S101)]
    [InlineData(ProductSpecification.S57)]
    public async Task PerExportDiscardIsRejectedBeforeOpeningTheDatabase(ProductSpecification specification) {
        var repository = new EncPackageRepository(null!);
        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => repository.DiscardAsync("member", specification));
        Assert.Contains("whole ENC package", error.Message);
    }

    /// <summary>Every possible failure combination wins over a successful, held, or processing counterpart.</summary>
    [Fact]
    public void FailureWinsAgainstEveryOtherMemberState() {
        foreach (var state in Enum.GetValues<ProductState>()) {
            Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), new() { State = ProductState.Error }, new() { State = state }));
            Assert.Equal(EncPackageStatus.Error, EncPackageStatusResolver.Resolve(new(), new() { State = state }, new() { State = ProductState.Rejected }));
        }
    }

    /// <summary>The actions response reports the same aggregate and safe diagnostic as status and AOI projections.</summary>
    [Fact]
    public async Task ActionsIncludeAggregateStatusAndFailureMessage() {
        var fixture = await DpcRunFixture.CreatedPackageAsync();
        var package = fixture.Packages.Active[DpcRunFixture.Source];
        var s101 = await fixture.TrackAsync(ProductSpecification.S101);
        s101.State = ProductState.Error;
        s101.ErrorCode = "SEVENCS_VALIDATION_FAILED";
        s101.ErrorMessage = "SevenCs found one critical finding.";
        var controls = DpcProxy<IEncPackageControlRepository>.Create((method, _) => method.Name == nameof(IEncPackageControlRepository.GetForPackageAsync)
            ? Task.FromResult<EncPackageControlState?>(new() { PackageId = package.Id, SourceDatasetName = package.SourceDatasetName })
            : throw new NotSupportedException(method.Name));
        var environment = DpcProxy<IHostEnvironment>.Create((method, _) => method.Name == "get_EnvironmentName" ? "Production" : throw new NotSupportedException(method.Name));
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?> { ["EncPackageActions:Enabled"] = "true" }).Build();
        var service = new EncPackageActionService(fixture.Packages, controls, fixture.Workflow, null!, configuration, environment, fixture.Clock);

        var response = await service.ReadAsync(DpcRunFixture.Source);

        Assert.NotNull(response);
        Assert.Equal(EncPackageStatus.Error, response.Status);
        Assert.Equal(s101.ErrorMessage, response.ErrorMessage);
        Assert.Equal(package.BuiltAtUtc, response.BuiltAtUtc);
    }
}
