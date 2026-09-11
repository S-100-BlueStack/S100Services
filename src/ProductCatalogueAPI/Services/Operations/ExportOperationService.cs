using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using System.Text;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>
/// Builds SQL-owned candidates from read-only geodatabase snapshots and deliberately stops before S-128 publication.
/// </summary>
public class ExportOperationService(IProductManager productManager, IExportEngineRegistry exportEngines, IProductWorkflowRepository workflowRepository, ISevenCsService sevenCsService, TimeProvider timeProvider, ILogger<ExportOperationService> logger) : IExportOperationService
{
    private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
    private readonly IExportEngineRegistry _exportEngines = exportEngines;
    private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
    private readonly ISevenCsService _sevenCsService = sevenCsService;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ExportOperationService> _logger = logger;

    /// <inheritdoc/>
    public async Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) {
        cancellationToken.ThrowIfCancellationRequested();
        var product = ResolveRequiredExportProduct(datasetName);
        var targetDatasetName = product.DatasetName;
        var productSpecification = product.ProductSpecification;
        var engine = _exportEngines.GetRequiredEngine(productSpecification);
        var publicVersion = await _electronicProductManager.ReadElectronicProductVersionAsync(targetDatasetName, productSpecification.ToString(), cancellationToken)
            ?? throw new ExportOperationRejectedException($"Electronic product '{datasetName}' was not found in the public S-128 catalogue.");

        targetDatasetName = publicVersion.DatasetName;
        var initialPublishedEdition = publicVersion.Edition ?? 0;
        var initialPublishedUpdate = publicVersion.Update ?? 0;
        var track = await _workflowRepository.GetOrCreateTrackAsync(targetDatasetName, productSpecification, engine.Kind, initialPublishedEdition, initialPublishedUpdate, cancellationToken);
        EnsureExportCanStart(track);
        var (edition, update) = GetCandidateVersion(track, revisionType);
        var sourceDatasetName = ResolveSourceDatasetName(targetDatasetName, productSpecification);

        cancellationToken.ThrowIfCancellationRequested();
        beforeMutation?.Invoke();
        var now = _timeProvider.GetUtcNow().UtcDateTime;
        var exportStarted = false;

        try {
            await _workflowRepository.BeginExportAsync(track.Id, edition, update, user, now, cancellationToken);
            exportStarted = true;

            var exportType = revisionType == ExportRevisionType.NewEdition ? ExportTypes.NewEdition : ExportTypes.Update;
            var dataset = await _electronicProductManager.CreateExportSnapshotAsync(sourceDatasetName, exportType, edition, update, cancellationToken);
            var datasetYaml = SerializeDataset(dataset);
            if (string.IsNullOrWhiteSpace(datasetYaml))
                throw new ExportSourceUnavailableException(sourceDatasetName);

            var revisionId = await _workflowRepository.AddRevisionAsync(new ProductRevisionWrite(track.Id, revisionType, edition, update, datasetYaml, changeSummaryYaml, user, now), cancellationToken);
            await _workflowRepository.AddArtifactAsync(new ProductArtifactWrite(track.Id, revisionId, ProductArtifactKind.DatasetYaml, $"{sourceDatasetName}-{edition}-{update:000}.yaml", "application/yaml", Encoding.UTF8.GetBytes(datasetYaml), now), cancellationToken);

            var exportResult = await engine.ExportAsync(new ExportEngineRequest(targetDatasetName, productSpecification, edition, update, _electronicProductManager.OutputFolder, datasetYaml, SourceDatasetName: sourceDatasetName), cancellationToken);
            foreach (var artifact in exportResult.Artifacts) {
                await _workflowRepository.AddArtifactAsync(new ProductArtifactWrite(track.Id, revisionId, artifact.Kind, artifact.FileName, artifact.MediaType, artifact.Content, now, artifact.MetadataJson), cancellationToken);
            }

            await _workflowRepository.SetStateAsync(track.Id, ProductState.Validating, user, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken: cancellationToken);
            if (productSpecification == ProductSpecification.S101) {
                SevenCsValidationResult validationResult;
                try {
                    validationResult = await _sevenCsService.ValidateDatasetAsync(targetDatasetName, edition, update, _electronicProductManager.OutputFolder, cancellationToken);
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                }
                catch (Exception ex) {
                    throw ExportValidationException.Unavailable(targetDatasetName, ex);
                }

                foreach (var diagnostic in validationResult.Diagnostics)
                    await _workflowRepository.AddArtifactAsync(new ProductArtifactWrite(track.Id, revisionId, ProductArtifactKind.ValidationDiagnostic, diagnostic.FileName, diagnostic.MediaType, diagnostic.Content, _timeProvider.GetUtcNow().UtcDateTime), cancellationToken);
                if (validationResult.Summary.Errors > 0 || validationResult.Summary.Critical > 0 || validationResult.Summary.ShallowIsolatedDangersUpdatedBathy)
                    throw ExportValidationException.Findings(targetDatasetName, validationResult.Summary.Errors, validationResult.Summary.Critical, validationResult.Summary.ShallowIsolatedDangersUpdatedBathy);
            }

            await _workflowRepository.SetStateAsync(track.Id, ProductState.ReadyForDistribution, user, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken: cancellationToken);
            _logger.LogInformation("Candidate export is ready for distribution. DatasetName: {DatasetName}. SourceDatasetName: {SourceDatasetName}. ProductSpecification: {ProductSpecification}. Edition: {Edition}. Update: {Update}. S128Published: {S128Published}", targetDatasetName, sourceDatasetName, productSpecification, edition, update, false);
            return new ExportOperationResult(ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage);
        }
        catch (Exception ex) when (exportStarted) {
            await SetErrorBestEffortAsync(track.Id, user, ex);
            throw;
        }
    }

    /// <inheritdoc/>
    public async Task<ExportOperationResult> ExecuteCancelExportAsync(string datasetName, string? user, CancellationToken cancellationToken = default, Action? beforeMutation = null) {
        cancellationToken.ThrowIfCancellationRequested();
        var product = ResolveRequiredExportProduct(datasetName);
        var targetDatasetName = product.DatasetName;
        var productSpecification = product.ProductSpecification;
        var track = await _workflowRepository.GetTrackAsync(targetDatasetName, productSpecification, cancellationToken)
            ?? throw new ExportOperationRejectedException($"No {productSpecification} export track exists for '{datasetName}'.");

        if (!track.CandidateEdition.HasValue || !track.CandidateUpdate.HasValue)
            throw new ExportOperationRejectedException("There is no unverified candidate export to cancel.");
        if (track.State is ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published)
            throw new ExportOperationRejectedException($"A candidate in state {track.State} cannot be cancelled.");

        beforeMutation?.Invoke();
        var engine = _exportEngines.GetRequiredEngine(productSpecification);
        await engine.DeleteOutputAsync(new ExportOutputIdentity(targetDatasetName, productSpecification, track.CandidateEdition.Value, track.CandidateUpdate.Value, _electronicProductManager.OutputFolder), cancellationToken);
        await _workflowRepository.CancelCandidateAsync(track.Id, user, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
        _logger.LogInformation("Unverified candidate export cancelled. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}.", targetDatasetName, productSpecification);
        return new ExportOperationResult(ExportOperationContract.CancelExportCompletedCode, ExportOperationContract.CancelExportCompletedMessage);
    }

    /// <summary>Serializes a read-only dataset snapshot. Overridden by focused tests.</summary>
    protected virtual string SerializeDataset(S100FC.YAML.Dataset dataset) => dataset.Serialize();

    private ExportProductIdentity ResolveRequiredExportProduct(string requestedDatasetName) {
        try {
            return ExportProductResolver.Resolve(_electronicProductManager, requestedDatasetName)
                ?? throw new ExportOperationRejectedException($"Electronic product '{requestedDatasetName}' was not found in the public S-128 catalogue.");
        }
        catch (ProductMappingIntegrityException ex) {
            throw new ExportOperationRejectedException(ex.Message);
        }
    }

    private string ResolveSourceDatasetName(string targetDatasetName, ProductSpecification productSpecification) {
        if (productSpecification == ProductSpecification.S101)
            return targetDatasetName;

        var sources = _electronicProductManager.GetMappedElectronicProducts(targetDatasetName, ProductSpecification.S101.ToString());
        return sources.Count switch {
            1 when !string.IsNullOrWhiteSpace(sources[0].datasetName) => sources[0].datasetName!.Trim(),
            0 => throw new ExportOperationRejectedException($"S-57 product '{targetDatasetName}' has no S-101 ProductMapping in S-128."),
            _ => throw new ExportOperationRejectedException($"S-57 product '{targetDatasetName}' has multiple S-101 ProductMappings in S-128.")
        };
    }

    private static void EnsureExportCanStart(ProductExportTrackRecord track) {
        if (track.State is ProductState.Frozen or ProductState.InTransit or ProductState.Exporting or ProductState.Validating or ProductState.ReadyForDistribution or ProductState.AcceptedForDistribution)
            throw new ExportOperationRejectedException($"An export could not be created now. Current {track.ProductSpecification} state: {track.State}.");
    }

    private static (int Edition, int Update) GetCandidateVersion(ProductExportTrackRecord track, ExportRevisionType revisionType) => revisionType switch {
        ExportRevisionType.NewEdition => (checked(track.PublishedEdition + 1), 0),
        ExportRevisionType.Update when track.PublishedEdition > 0 => (track.PublishedEdition, checked(track.PublishedUpdate + 1)),
        ExportRevisionType.Update => throw new ExportOperationRejectedException("An update cannot be created before the first published edition."),
        _ => throw new ArgumentOutOfRangeException(nameof(revisionType), revisionType, null)
    };

    private async Task SetErrorBestEffortAsync(Guid trackId, string? user, Exception exception) {
        try {
            var (errorCode, errorMessage) = GetPublicFailure(exception);
            await _workflowRepository.SetStateAsync(trackId, ProductState.Error, user, _timeProvider.GetUtcNow().UtcDateTime, errorCode, errorMessage);
        }
        catch (Exception persistenceException) {
            _logger.LogError(persistenceException, "Failed to persist Error state after candidate export failure. TrackId: {TrackId}.", trackId);
        }

        _logger.LogError(exception, "Candidate export failed and defaulted to Error. TrackId: {TrackId}.", trackId);
    }

    private static (string Code, string Message) GetPublicFailure(Exception exception) => exception switch {
        ExportValidationException validationException => (validationException.Code, validationException.PublicMessage),
        _ => (exception.GetType().Name, "The export failed. Contact support and provide the dataset name and failure time.")
    };
}
