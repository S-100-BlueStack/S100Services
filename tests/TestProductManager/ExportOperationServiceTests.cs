using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using System.Collections;
using System.Net.Sockets;
using static ProductCatalogueAPI.Services.SevenCs.SevenCsService;
using YamlDataset = S100FC.YAML.Dataset;

namespace TestProductCatalogueAPI;

public sealed class ExportOperationServiceTests
{
    [Fact]
    public async Task NewEditionUsesReadOnlySnapshotAndStopsBeforeS128Publication() {
        var products = new RecordingElectronicProductManager();
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        var result = await service.ExecuteExportAsync("101DK001", ExportRevisionType.NewEdition, "developer");

        Assert.Equal(ExportOperationContract.ExportCompletedCode, result.Code);
        Assert.Equal(repository.CompletionStateId, result.StateRecordId);
        Assert.Equal(repository.Track.DatasetName, result.DatasetName);
        Assert.Equal(repository.Track.CandidateEdition, result.ResultEdition);
        Assert.Equal(repository.Track.CandidateUpdate, result.ResultUpdate);
        Assert.Equal(1, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
        Assert.Equal((5, 0), products.LastSnapshotVersion);
        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Equal(1, engine.ExportCalls);
        Assert.Single(repository.Revisions);
    }

    [Fact]
    public async Task PackageExportUsesPersistedSharedYamlWithoutTakingAnotherSnapshot() {
        var products = new RecordingElectronicProductManager();
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        var result = await service.ExecutePackageExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "shared-enc-yaml", "summary-yaml");
        Assert.Null(result.StateRecordId);
        Assert.Equal(0, repository.CompletionCalls);
        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);

        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal("shared-enc-yaml", engine.LastRequest?.DatasetYaml);
        Assert.Equal("101DK001", engine.LastRequest?.SourceDatasetName);
        Assert.Equal("summary-yaml", Assert.Single(repository.Revisions).ChangeSummaryYaml);
    }

    [Theory]
    [InlineData("101DK001")]
    [InlineData("DK3BIDQE")]
    public async Task CriticalValidationFindingsPersistDiagnosticsBeforeFailingTheCandidate(string datasetName) {
        var repository = new RecordingWorkflowRepository();
        var diagnostic = new SevenCsDiagnosticArtifact($"{datasetName}.vld", "text/plain", "validation details"u8.ToArray());
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse { Errors = 3, Critical = 2 }, [diagnostic]);

        var exception = await Assert.ThrowsAsync<ExportValidationException>(() => service.ExecuteExportAsync(datasetName, ExportRevisionType.Update, null));

        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal(0, repository.CompletionCalls);
        Assert.Equal("SEVENCS_VALIDATION_FAILED", repository.LastErrorCode);
        Assert.Contains("3 errors and 2 critical findings", exception.PublicMessage);
        Assert.Equal(exception.PublicMessage, repository.LastErrorMessage);
        Assert.DoesNotContain(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationReport);
        Assert.Contains(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationDiagnostic && artifact.FileName == $"{datasetName}.vld");
    }

    [Theory]
    [InlineData("101DK001")]
    [InlineData("DK3BIDQE")]
    public async Task NonCriticalFindingsAllowExportToBeReadyForDistribution(string datasetName) {
        var repository = new RecordingWorkflowRepository();
        var diagnostic = new SevenCsDiagnosticArtifact($"{datasetName}.vld", "text/plain", "validation details"u8.ToArray());
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse { Errors = 3, ShallowIsolatedDangersUpdatedBathy = true }, [diagnostic]);

        await service.ExecuteExportAsync(datasetName, ExportRevisionType.Update, null);

        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Null(repository.LastErrorMessage);
        Assert.Contains(repository.Artifacts, artifact => artifact.Kind == ProductArtifactKind.ValidationDiagnostic && artifact.FileName == $"{datasetName}.vld");
    }

    [Theory]
    [InlineData("101DK001")]
    [InlineData("DK3BIDQE")]
    public async Task SevenCsTimeoutFailsTheCandidateInsteadOfMarkingItReady(string datasetName) {
        var repository = new RecordingWorkflowRepository();
        var timeout = new HttpRequestException("SevenCs timed out", new SocketException((int)SocketError.TimedOut));
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse(), validationFailure: timeout);

        var error = await Assert.ThrowsAsync<ExportValidationException>(() => service.ExecutePackageExportAsync(datasetName, ExportRevisionType.NewEdition, "shared-yaml", "summary-yaml"));

        Assert.Equal("SEVENCS_VALIDATION_UNAVAILABLE", error.Code);
        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal(0, repository.CompletionCalls);
        Assert.Equal(error.PublicMessage, repository.LastErrorMessage);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task S57ValidationUsesTargetCandidateAndPersistsBothDiagnosticsOnItsRevision(bool packageExport) {
        var repository = new RecordingWorkflowRepository();
        var products = new RecordingElectronicProductManager();
        var diagnostics = new[] {
            new SevenCsDiagnosticArtifact("DK3BIDQE.vld", "text/plain", "S57 findings"u8.ToArray()),
            new SevenCsDiagnosticArtifact("DK3BIDQE-validation-shapes.zip", "application/zip", new byte[] { 1, 2, 3 })
        };
        var validator = new FakeSevenCsService(new SummaryResponse(), diagnostics, null);
        var service = CreateService(products, repository, new RecordingExportEngine(), new SummaryResponse(), sevenCs: validator);
        using var cancellation = new CancellationTokenSource();

        if (packageExport)
            await service.ExecutePackageExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "shared-yaml", "summary-yaml", cancellation.Token);
        else
            await service.ExecuteExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "developer", cancellationToken: cancellation.Token);

        Assert.Equal(("DK3BIDQE", ProductSpecification.S57, 5, 0, "output", cancellation.Token), validator.LastRequest!.Value);
        Assert.Equal(ProductState.ReadyForDistribution, repository.Track.State);
        Assert.Equal(0, products.AttachmentCalls);
        Assert.Equal(packageExport ? 0 : 1, repository.CompletionCalls);
        var artifacts = repository.Artifacts.Where(artifact => artifact.Kind == ProductArtifactKind.ValidationDiagnostic).ToArray();
        Assert.Equal(2, artifacts.Length);
        Assert.All(artifacts, artifact => {
            Assert.Equal(repository.Track.Id, artifact.TrackId);
            Assert.Equal(repository.RevisionId, artifact.RevisionId);
            var diagnostic = Assert.Single(diagnostics, item => item.FileName == artifact.FileName);
            Assert.Equal(diagnostic.MediaType, artifact.MediaType);
            Assert.Equal(diagnostic.Content, artifact.Content);
        });
    }

    [Fact]
    public async Task S57ValidationCancellationLeavesAnErrorWithoutWrappingItAsServiceUnavailable() {
        var repository = new RecordingWorkflowRepository();
        using var cancellation = new CancellationTokenSource();
        var validator = new FakeSevenCsService(new SummaryResponse(), [], null) {
            BeforeValidation = () => cancellation.Cancel()
        };
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse(), sevenCs: validator);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.ExecutePackageExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "shared-yaml", "summary-yaml", cancellation.Token));

        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal(ExportJobContract.OperationCancelledCode, repository.LastErrorCode);
        Assert.Equal(0, repository.CompletionCalls);
    }

    [Fact]
    public async Task FrozenCanOnlyBeClearedByTheUserFlowAndBlocksExportBeforeMutation() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Frozen };
        var products = new RecordingElectronicProductManager();
        var service = CreateService(products, repository, new RecordingExportEngine(), new SummaryResponse());
        var guardCalled = false;

        await Assert.ThrowsAsync<ExportOperationRejectedException>(() => service.ExecuteExportAsync("101DK001", ExportRevisionType.NewEdition, null, beforeMutation: () => guardCalled = true));

        Assert.False(guardCalled);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(ProductState.Frozen, repository.Track.State);
    }

    [Fact]
    public async Task DiscardRestoresThePreviousStateAndClearsOnlyTheSqlCandidateAndFilesystemOutput() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.ChangesDetected };
        var track = Assert.IsType<ProductExportTrackRecord>(await repository.GetTrackAsync("101DK001", ProductSpecification.S101));
        await repository.BeginExportAsync(track.Id, 5, 0, "developer", DateTime.UtcNow);
        await repository.SetStateAsync(track.Id, ProductState.ReadyForDistribution, "developer", DateTime.UtcNow);
        var products = new RecordingElectronicProductManager();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        var result = await service.ExecuteDiscardAsync("101DK001", "developer");

        Assert.Equal(ExportOperationContract.DiscardCompletedCode, result.Code);
        Assert.Equal(ProductState.ChangesDetected, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Null(repository.Track.CandidatePreviousState);
        Assert.Equal(1, engine.DeleteCalls);
        Assert.Equal(new ExportOutputIdentity("101DK001", ProductSpecification.S101, 5, 0, "output"), engine.LastDeletedOutput);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
    }

    [Fact]
    public async Task DiscardRestoresPreviousStateAndPreservesManualHold() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.ChangesDetected };
        var track = Assert.IsType<ProductExportTrackRecord>(await repository.GetTrackAsync("101DK001", ProductSpecification.S101));
        await repository.BeginExportAsync(track.Id, 5, 0, "developer", DateTime.UtcNow);
        await repository.SetStateAsync(track.Id, ProductState.Error, "developer", DateTime.UtcNow);
        track.IsManuallyFrozen = true;
        var products = new RecordingElectronicProductManager();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await service.ExecuteDiscardAsync("101DK001", "developer");

        Assert.Equal(ProductState.ChangesDetected, repository.Track.State);
        Assert.True(repository.Track.IsManuallyFrozen);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Null(repository.Track.CandidatePreviousState);
        Assert.Equal(1, engine.DeleteCalls);
        Assert.Equal(new ExportOutputIdentity("101DK001", ProductSpecification.S101, 5, 0, "output"), engine.LastDeletedOutput);
        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(0, products.AttachmentCalls);
    }

    [Fact]
    public async Task InternalPackageRefreshAcknowledgesFailureBeforeCandidateCreation() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Error };
        var packages = new RecordingPackageRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse(), packages: packages);

        await service.ExecuteDiscardAsync("101DK001", "system", preservePackageScanBound: true);

        Assert.Equal(ProductState.Idle, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Equal(0, engine.DeleteCalls);
        Assert.Equal(1, packages.DiscardCalls);
        Assert.True(packages.PreserveScanBound);
    }

    [Fact]
    public async Task ManualDiscardRecoversStandaloneErrorWithoutCandidateVersion() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Error };
        var engine = new RecordingExportEngine();
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse(),
            packages: new RecordingPackageRepository { HasActivePackage = false });

        var result = await service.ExecuteDiscardAsync("101DK001", "operator");

        Assert.Equal(ExportOperationContract.DiscardCompletedCode, result.Code);
        Assert.Equal(ProductState.Idle, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Equal(0, engine.DeleteCalls);
    }

    [Fact]
    public async Task ManualDiscardCannotSplitAnActiveEncPackage() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.Error };
        var engine = new RecordingExportEngine();
        var packages = new RecordingPackageRepository();
        var track = await repository.GetTrackAsync("101DK001", ProductSpecification.S101);
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse(), packages: packages);

        var exception = await Assert.ThrowsAsync<ExportOperationRejectedException>(
            () => service.ExecuteDiscardAsync("101DK001", "operator"));

        Assert.Contains("whole package", exception.Message);
        Assert.Equal(ProductState.Error, track!.State);
        Assert.Equal(5, track.CandidateEdition);
        Assert.Equal(0, engine.DeleteCalls);
        Assert.Equal(0, packages.DiscardCalls);
    }

    [Fact]
    public async Task ManualExportCannotReplaceActiveEncPackageYamlOrCandidate() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Error, CandidateEdition = 5, CandidateUpdate = 0 };
        var engine = new RecordingExportEngine();
        var products = new RecordingElectronicProductManager();
        var service = CreateService(products, repository, engine, new SummaryResponse(), packages: new RecordingPackageRepository());

        await Assert.ThrowsAsync<ExportOperationRejectedException>(
            () => service.ExecuteExportAsync("101DK001", ExportRevisionType.NewEdition, "operator"));

        Assert.Equal(0, products.SnapshotCalls);
        Assert.Equal(0, engine.ExportCalls);
    }

    [Fact]
    public async Task ExternalRejectionCannotBeRetriedWithoutAcknowledgement() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Rejected };
        var engine = new RecordingExportEngine();
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse());

        await Assert.ThrowsAsync<ExportOperationRejectedException>(
            () => service.ExecuteExportAsync("101DK001", ExportRevisionType.NewEdition, "operator"));

        Assert.Equal(ProductState.Rejected, repository.Track.State);
        Assert.Equal(0, engine.ExportCalls);
    }

    [Fact]
    public async Task StandaloneDiscardCannotBypassExternalRejectionAcknowledgement() {
        var repository = new RecordingWorkflowRepository { InitialState = ProductState.Rejected, CandidateEdition = 5, CandidateUpdate = 0 };
        var engine = new RecordingExportEngine();
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse());

        await Assert.ThrowsAsync<ExportOperationRejectedException>(
            () => service.ExecuteDiscardAsync("101DK001", "operator"));

        Assert.Equal(ProductState.Rejected, repository.Track.State);
        Assert.Equal(0, engine.DeleteCalls);
    }

    [Theory]
    [InlineData(ProductState.Exporting)]
    [InlineData(ProductState.Validating)]
    [InlineData(ProductState.InTransit)]
    [InlineData(ProductState.AcceptedForDistribution)]
    [InlineData(ProductState.Published)]
    public async Task ManualDiscardRejectsNonFinalOrSubmittedProductStates(ProductState state) {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = state };
        var engine = new RecordingExportEngine();
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse());

        await Assert.ThrowsAsync<ExportOperationRejectedException>(
            () => service.ExecuteDiscardAsync("101DK001", "operator"));

        Assert.Equal(state, repository.Track.State);
        Assert.Equal(0, engine.DeleteCalls);
    }

    [Fact]
    public async Task DiscardRemainsSuccessfulWhenOutputCleanupFailsAfterSqlCommit() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.Error };
        var engine = new RecordingExportEngine { FailOnDelete = true };
        var service = CreateService(new RecordingElectronicProductManager(), repository, engine, new SummaryResponse());

        var result = await service.ExecuteDiscardAsync("101DK001", "operator");

        Assert.Equal(ExportOperationContract.DiscardCompletedCode, result.Code);
        Assert.Equal(ProductState.Idle, repository.Track.State);
        Assert.Null(repository.Track.CandidateEdition);
        Assert.Equal(1, engine.DeleteCalls);
        Assert.Equal(new ExportOutputIdentity("101DK001", ProductSpecification.S101, 5, 0, "output"), engine.LastDeletedOutput);
    }

    [Fact]
    public async Task RetryingAfterErrorPreservesOriginalStateForLaterDiscard() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        await repository.SetStateAsync(track.Id, ProductState.ChangesDetected, "system", DateTime.UtcNow);
        await repository.BeginExportAsync(track.Id, 5, 0, "system", DateTime.UtcNow);
        await repository.SetStateAsync(track.Id, ProductState.Error, "system", DateTime.UtcNow);
        await repository.BeginExportAsync(track.Id, 5, 0, "system", DateTime.UtcNow);
        await repository.SetStateAsync(track.Id, ProductState.Error, "system", DateTime.UtcNow);
        await repository.DiscardCandidateAsync(track.Id, "operator", DateTime.UtcNow);

        var restored = await repository.GetTrackAsync("101DK001", ProductSpecification.S101);
        Assert.Equal(ProductState.ChangesDetected, restored!.State);
        Assert.Null(restored.CandidateEdition);
    }

    [Fact]
    public async Task FailedTrackWithoutCandidateCanBeResetByRepository() {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync("101DK001", ProductSpecification.S101, ExportEngineKind.IsoIec8211, 4, 2);
        await repository.SetStateAsync(track.Id, ProductState.Error, "system", DateTime.UtcNow, "ENC_CANDIDATE_FAILED", "Build failed before candidate creation");

        await repository.DiscardCandidateAsync(track.Id, "developer", DateTime.UtcNow);

        var restored = await repository.GetTrackAsync("101DK001", ProductSpecification.S101);
        Assert.Equal(ProductState.Idle, restored!.State);
        Assert.Null(restored.CandidateEdition);
    }

    [Fact]
    public async Task InternalRefreshPreservesScanBoundWhenDiscardingItsReadyCandidate() {
        var repository = new RecordingWorkflowRepository { CandidateEdition = 5, CandidateUpdate = 0, InitialState = ProductState.ReadyForDistribution };
        var packages = new RecordingPackageRepository();
        var service = CreateService(new RecordingElectronicProductManager(), repository, new RecordingExportEngine(), new SummaryResponse(), packages: packages);

        await service.ExecuteDiscardAsync("101DK001", "system", preservePackageScanBound: true);

        Assert.True(packages.PreserveScanBound);
    }

    [Fact]
    public async Task S57ExportUsesProductMappingInsteadOfDerivingTheDatasetName() {
        var products = new RecordingElectronicProductManager();
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await service.ExecuteExportAsync("DK3BIDQE", ExportRevisionType.NewEdition, "developer");

        Assert.Equal("DK3BIDQE", repository.Track.DatasetName);
        Assert.Equal("101DK001", products.LastSnapshotDatasetName);
        Assert.Equal("DK3BIDQE", engine.LastRequest!.DatasetName);
        Assert.Equal("101DK001", engine.LastRequest.SourceDatasetName);
    }

    [Fact]
    public async Task CancellationDuringSnapshotLeavesTrackInErrorAndNeverReportsSuccess() {
        using var cancellation = new CancellationTokenSource();
        var products = new RecordingElectronicProductManager {
            CancelDuringSnapshot = cancellation
        };
        var repository = new RecordingWorkflowRepository();
        var engine = new RecordingExportEngine();
        var service = CreateService(products, repository, engine, new SummaryResponse());

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.ExecuteExportAsync(
                "101DK001",
                ExportRevisionType.NewEdition,
                "developer",
                cancellationToken: cancellation.Token
            )
        );

        Assert.Equal(ProductState.Error, repository.Track.State);
        Assert.Equal(ExportJobContract.OperationCancelledCode, repository.LastErrorCode);
        Assert.Equal(1, products.SnapshotCalls);
        Assert.Empty(repository.Revisions);
        Assert.Equal(0, engine.ExportCalls);
    }

    private static TestExportOperationService CreateService(RecordingElectronicProductManager products, RecordingWorkflowRepository repository, RecordingExportEngine engine, SummaryResponse validation, IReadOnlyList<SevenCsDiagnosticArtifact>? diagnostics = null, Exception? validationFailure = null, IEncPackageRepository? packages = null, FakeSevenCsService? sevenCs = null) => new(
        new FakeProductManager(products), new ExportEngineRegistry([engine]), repository, sevenCs ?? new FakeSevenCsService(validation, diagnostics ?? [], validationFailure),
        new FixedTimeProvider(DateTimeOffset.Parse("2026-08-10T20:00:00Z")), "dataset-yaml", packages);

    private sealed class TestExportOperationService(IProductManager productManager, IExportEngineRegistry engines, IProductWorkflowRepository repository, ISevenCsService sevenCs, TimeProvider timeProvider, string yaml, IEncPackageRepository? packages)
        : ExportOperationService(productManager, engines, repository, sevenCs, timeProvider, NullLogger<ExportOperationService>.Instance, packages)
    {
        protected override string SerializeDataset(YamlDataset dataset) => yaml;
    }

    private sealed class FakeProductManager(IElectronicProductManager electronicProductManager) : IProductManager
    {
        public INauticalProductManager NauticalProductManager => null!;
        public IElectronicProductManager ElectronicProductManager { get; } = electronicProductManager;
    }

    private sealed class RecordingElectronicProductManager : IElectronicProductManager
    {
        public int SnapshotCalls { get; private set; }
        public int AttachmentCalls { get; private set; }
        public CancellationTokenSource? CancelDuringSnapshot { get; init; }
        public (int Edition, int Update) LastSnapshotVersion { get; private set; }
        public string? LastSnapshotDatasetName { get; private set; }
        public string OutputFolder => "output";
        public Task<ElectronicProductVersion?> ReadElectronicProductVersionAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<ElectronicProductVersion?>(new(datasetName, 4, 2));
        public Task<YamlDataset> CreateExportSnapshotAsync(string name, ExportTypes exportType, int edition, int update, CancellationToken cancellationToken = default) {
            SnapshotCalls++;
            LastSnapshotDatasetName = name;
            LastSnapshotVersion = (edition, update);
            CancelDuringSnapshot?.Cancel();
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<YamlDataset>(null!);
        }
        public Task CreateAttachmentAsync(string name, ExportTypes exportType, string yaml, string index, string sign) { AttachmentCalls++; return Task.CompletedTask; }
        public Task CreateS57AttachmentAsync(string name, ExportTypes exportType, string yaml) { AttachmentCalls++; return Task.CompletedTask; }
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name) => null;
        public S100FC.S128.FeatureTypes.ElectronicProduct? ElectronicProduct(string name, string productSpecification) => null;
        public S100FC.S128.FeatureTypes.ElectronicProduct? ResolveExportProduct(string name) => name == "DK3BIDQE"
            ? new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "DK3BIDQE", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-57" } }
            : new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "101DK001", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" } };
        public IReadOnlyList<S100FC.S128.FeatureTypes.ElectronicProduct> GetMappedElectronicProducts(string name, string productSpecification) => name == "DK3BIDQE" && productSpecification == "S101"
            ? [new S100FC.S128.FeatureTypes.ElectronicProduct { datasetName = "101DK001", productSpecification = new S100FC.S128.ComplexAttributes.productSpecification { name = "S-101" } }]
            : [];
        public IEnumerator<string> GetEnumerator() => Array.Empty<string>().AsEnumerable().GetEnumerator();
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, int? specificUsage, string boundary, string? ProductMapping, int? optimumDisplayScale = null) => throw new NotSupportedException();
        public Task CreateElectronicProductAsync(string name, S100FC.S128.ComplexAttributes.productSpecification productSpecification, string boundary, int edition, int update, byte[] zipfile) => throw new NotSupportedException();
        public Task<YamlDataset> CreateNewDatasetAsync(string name) => throw new NotSupportedException();
        public Task<YamlDataset> CreateNewEditionAsync(string name) => throw new NotSupportedException();
        public Task<YamlDataset> CreateNewUpdateAsync(string name) => throw new NotSupportedException();
        public Task<YamlDataset> ReissueAsync(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs() => throw new NotSupportedException();
        public Task<Dictionary<string, string>> GetDatasetAOIs(string productSpecification) => throw new NotSupportedException();
        public Task<bool> IsDirtyAsync(string name) => throw new NotSupportedException();
        public Task<string> GetDatasetBoundary(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, ArchiveRow>> GetPendingEditsAsync(string name) => throw new NotSupportedException();
        public Task<Dictionary<string, Dictionary<string, ArchiveRow>>> GetPendingEditsAsync(DateTime sinceUtc) => throw new NotSupportedException();
        public Task<(string yaml, string index)> GetLatestDatasetYAML(string name, int edition) => throw new NotSupportedException();
    }

    private sealed class RecordingExportEngine : IExportEngine
    {
        public ExportEngineKind Kind => ExportEngineKind.IsoIec8211;
        public int ExportCalls { get; private set; }
        public int DeleteCalls { get; private set; }
        public ExportOutputIdentity? LastDeletedOutput { get; private set; }
        public bool FailOnDelete { get; init; }
        public ExportEngineRequest? LastRequest { get; private set; }
        public bool Supports(ProductSpecification productSpecification) => productSpecification is ProductSpecification.S57 or ProductSpecification.S101;
        public Task<ExportEngineResult> ExportAsync(ExportEngineRequest request, CancellationToken cancellationToken = default) { ExportCalls++; LastRequest = request; return Task.FromResult(new ExportEngineResult("output", [])); }
        public Task DeleteOutputAsync(ExportOutputIdentity output, CancellationToken cancellationToken = default) { DeleteCalls++; LastDeletedOutput = output; return FailOnDelete ? Task.FromException(new IOException("Test cleanup failure")) : Task.CompletedTask; }
    }

    private sealed class RecordingPackageRepository : IEncPackageRepository
    {
        public Task<EncPackage?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default) => Task.FromResult<EncPackage?>(null);
        public Task<EncPackageDiscardResult> TryDiscardPackageAsync(Guid id, string actor, DateTime atUtc, CancellationToken cancellationToken = default) => Task.FromResult(new EncPackageDiscardResult(EncPackageDiscardStatus.NotFound, []));
        public int DiscardCalls { get; private set; }
        public bool PreserveScanBound { get; private set; }
        public bool HasActivePackage { get; init; } = true;
        public Task<IReadOnlyDictionary<string, EncPackage>> GetActiveAsync(IEnumerable<string> sourceDatasetNames, CancellationToken cancellationToken = default, bool includeSourceYaml = true) =>
            Task.FromResult<IReadOnlyDictionary<string, EncPackage>>(HasActivePackage
                ? new Dictionary<string, EncPackage> { ["101DK001"] = new() { Id = Guid.NewGuid(), SourceDatasetName = "101DK001", S57DatasetName = "DK3BIDQE", ErrorMessage = "Failed export" } }
                : new Dictionary<string, EncPackage>());
        public Task<DateTime?> GetReplayFromUtcAsync(CancellationToken cancellationToken = default) => Task.FromResult<DateTime?>(null);
        public Task<IReadOnlyDictionary<string, DateTime>> GetReplayBoundsAsync(CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyDictionary<string, DateTime>>(new Dictionary<string, DateTime>());
        public Task MarkReplayAsync(string sourceDatasetName, DateTime scanFromUtc, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task ClearReplayAsync(string sourceDatasetName, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task<bool> TryCreateAsync(EncPackage package, CancellationToken cancellationToken = default) => Task.FromResult(true);
        public Task SetErrorAsync(Guid packageId, string message, CancellationToken cancellationToken = default) => Task.CompletedTask;
        public Task DiscardAsync(string datasetName, ProductSpecification specification, CancellationToken cancellationToken = default, bool preserveScanBound = false) { DiscardCalls++; PreserveScanBound = preserveScanBound; return Task.CompletedTask; }
    }

    private sealed class RecordingWorkflowRepository : IProductWorkflowRepository
    {
        public int CompletionCalls { get; private set; }
        public Guid CompletionStateId { get; } = Guid.NewGuid();
        public ProductState InitialState { get; init; } = ProductState.Idle;
        public int? CandidateEdition { get; init; }
        public int? CandidateUpdate { get; init; }
        public ProductExportTrackRecord Track { get; private set; } = null!;
        public Guid RevisionId { get; } = Guid.NewGuid();
        public List<ProductRevisionWrite> Revisions { get; } = [];
        public List<ProductArtifactWrite> Artifacts { get; } = [];
        public string? LastErrorCode { get; private set; }
        public string? LastErrorMessage { get; private set; }

        public Task<ProductExportTrackRecord?> GetTrackAsync(string datasetName, ProductSpecification productSpecification, CancellationToken cancellationToken = default) => Task.FromResult<ProductExportTrackRecord?>(EnsureTrack(datasetName, productSpecification));
        public Task<ProductExportTrackRecord> GetOrCreateTrackAsync(string datasetName, ProductSpecification productSpecification, ExportEngineKind engine, int publishedEdition, int publishedUpdate, CancellationToken cancellationToken = default) => Task.FromResult(EnsureTrack(datasetName, productSpecification));
        public Task BeginExportAsync(Guid trackId, int candidateEdition, int candidateUpdate, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { Track.CandidatePreviousState = Track.State; Track.State = ProductState.Exporting; Track.CandidateEdition = candidateEdition; Track.CandidateUpdate = candidateUpdate; return Task.CompletedTask; }
        public Task SetStateAsync(Guid trackId, ProductState state, string? owner, DateTime occurredAtUtc, string? errorCode = null, string? errorMessage = null, CancellationToken cancellationToken = default) { Track.State = state; LastErrorCode = errorCode; LastErrorMessage = errorMessage; return Task.CompletedTask; }
        public Task<Guid> CompleteExportWithHistoryAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) {
            Assert.Equal(ProductState.Validating, Track.State);
            CompletionCalls++;
            Track.State = ProductState.ReadyForDistribution;
            return Task.FromResult(CompletionStateId);
        }
        public Task<bool> SetManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { var changed = !Track.IsManuallyFrozen; Track.IsManuallyFrozen = true; return Task.FromResult(changed); }
        public Task<bool> ClearManualFreezeAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { var changed = Track.IsManuallyFrozen; Track.IsManuallyFrozen = false; return Task.FromResult(changed); }
        public Task DiscardCandidateAsync(Guid trackId, string? owner, DateTime occurredAtUtc, CancellationToken cancellationToken = default) { Track.State = Track.CandidatePreviousState ?? ProductState.Idle; Track.CandidateEdition = null; Track.CandidateUpdate = null; Track.CandidatePreviousState = null; return Task.CompletedTask; }
        public Task<Guid> AddRevisionAsync(ProductRevisionWrite revision, CancellationToken cancellationToken = default) { Revisions.Add(revision); return Task.FromResult(RevisionId); }
        public Task AddArtifactAsync(ProductArtifactWrite artifact, CancellationToken cancellationToken = default) { Artifacts.Add(artifact); return Task.CompletedTask; }
        public Task<IReadOnlyList<ProductExportTrackRecord>> GetTracksAsync(string datasetName, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductExportTrackRecord>>([]);
        public Task<Guid?> GetLatestRevisionIdAsync(Guid trackId, CancellationToken cancellationToken = default) => Task.FromResult<Guid?>(null);
        public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactsAsync(Guid productRevisionId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductArtifactReference>>([]);
        public Task<IReadOnlyList<ProductArtifactReference>> GetValidationArtifactHistoryAsync(Guid trackId, CancellationToken cancellationToken = default) => Task.FromResult<IReadOnlyList<ProductArtifactReference>>([]);
        public Task<ProductArtifactContent?> GetValidationArtifactAsync(string datasetName, Guid artifactId, CancellationToken cancellationToken = default) => Task.FromResult<ProductArtifactContent?>(null);

        private ProductExportTrackRecord EnsureTrack(string datasetName, ProductSpecification specification) => Track ??= new ProductExportTrackRecord { Id = Guid.NewGuid(), DatasetName = datasetName, ProductSpecification = specification, Engine = ExportEngineKind.IsoIec8211, State = InitialState, PublishedEdition = 4, PublishedUpdate = 2, CandidateEdition = CandidateEdition, CandidateUpdate = CandidateUpdate };
    }

    private sealed class FakeSevenCsService(SummaryResponse response, IReadOnlyList<SevenCsDiagnosticArtifact> diagnostics, Exception? failure) : ISevenCsService
    {
        public (string DatasetName, ProductSpecification Specification, int Edition, int Update, string OutputPath, CancellationToken Token)? LastRequest { get; private set; }
        public Action? BeforeValidation { get; init; }
        public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default) =>
            ValidateDatasetAsync(datasetName, ProductSpecification.S101, edition, update, outputPath, cancellationToken);
        public Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, ProductSpecification productSpecification, int edition, int update, string outputPath, CancellationToken cancellationToken = default) {
            LastRequest = (datasetName, productSpecification, edition, update, outputPath, cancellationToken);
            BeforeValidation?.Invoke();
            cancellationToken.ThrowIfCancellationRequested();
            return failure is null
                ? Task.FromResult(new SevenCsValidationResult(response, diagnostics))
                : Task.FromException<SevenCsValidationResult>(failure);
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }
}
