using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.SevenCs;
using S100FC.ProductCatalogue;
using S100FC.YAML;
using System.Diagnostics;
using System.Net.Sockets;
using System.Text;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>
/// Builds SQL-owned candidates from read-only geodatabase snapshots and deliberately stops before S-128 publication.
/// </summary>
public class ExportOperationService(IProductManager productManager, IExportEngineRegistry exportEngines, IProductWorkflowRepository workflowRepository, ISevenCsService sevenCsService, TimeProvider timeProvider, ILogger<ExportOperationService> logger, IEncPackageRepository? packages = null) : IExportOperationService
{
    private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
    private readonly IExportEngineRegistry _exportEngines = exportEngines;
    private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
    private readonly ISevenCsService _sevenCsService = sevenCsService;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ExportOperationService> _logger = logger;

    /// <inheritdoc/>
    public Task<ExportOperationResult> ExecuteExportAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml = null, CancellationToken cancellationToken = default, Action? beforeMutation = null) => ExecuteExportCoreAsync(datasetName, revisionType, user, changeSummaryYaml, cancellationToken, beforeMutation, null);

    /// <inheritdoc/>
    public Task<ExportOperationResult> ExecutePackageExportAsync(string datasetName, ExportRevisionType revisionType, string datasetYaml, string changeSummaryYaml, CancellationToken cancellationToken = default) => ExecuteExportCoreAsync(datasetName, revisionType, "system", changeSummaryYaml, cancellationToken, null, datasetYaml);

    private async Task<ExportOperationResult> ExecuteExportCoreAsync(string datasetName, ExportRevisionType revisionType, string? user, string? changeSummaryYaml, CancellationToken cancellationToken, Action? beforeMutation, string? datasetYamlOverride) {
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
            var snapshotStartedAt = Stopwatch.GetTimestamp();
            _logger.LogInformation(
                "Background ArcGIS export snapshot starting. DatasetName: {DatasetName}. SourceDatasetName: {SourceDatasetName}. ProductSpecification: {ProductSpecification}. OperationType: {OperationType}",
                targetDatasetName,
                sourceDatasetName,
                productSpecification,
                exportType
            );

            string datasetYaml;
            try {
                if (datasetYamlOverride is null) {
                    var dataset = await _electronicProductManager.CreateExportSnapshotAsync(sourceDatasetName, exportType, edition, update, cancellationToken);
                    datasetYaml = SerializeDataset(dataset);
                }
                else {
                    datasetYaml = datasetYamlOverride;
                }
            }
            finally {
                _logger.LogInformation(
                    "Background ArcGIS export snapshot finished. DatasetName: {DatasetName}. SourceDatasetName: {SourceDatasetName}. ProductSpecification: {ProductSpecification}. OperationType: {OperationType}. Cancelled: {Cancelled}. DurationMs: {DurationMs}",
                    targetDatasetName,
                    sourceDatasetName,
                    productSpecification,
                    exportType,
                    cancellationToken.IsCancellationRequested,
                    Stopwatch.GetElapsedTime(snapshotStartedAt).TotalMilliseconds
                );
            }
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
                try {
                    var validationResult = await _sevenCsService.ValidateDatasetAsync(
                        targetDatasetName,
                        edition,
                        update,
                        _electronicProductManager.OutputFolder,
                        cancellationToken
                    );

                    foreach (var diagnostic in validationResult.Diagnostics) {
                        await _workflowRepository.AddArtifactAsync(
                            new ProductArtifactWrite(
                                track.Id,
                                revisionId,
                                ProductArtifactKind.ValidationDiagnostic,
                                diagnostic.FileName,
                                diagnostic.MediaType,
                                diagnostic.Content,
                                _timeProvider.GetUtcNow().UtcDateTime
                            ),
                            cancellationToken
                        );
                    }

                    if (validationResult.Summary.Critical > 0) {
                        throw ExportValidationException.Findings(
                            targetDatasetName,
                            validationResult.Summary.Errors,
                            validationResult.Summary.Critical,
                            validationResult.Summary.ShallowIsolatedDangersUpdatedBathy
                        );
                    }
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) {
                    throw;
                }
                catch (ExportValidationException) {
                    throw;
                }
                catch (HttpRequestException ex)
                    when (ex.InnerException is SocketException {
                        SocketErrorCode: SocketError.TimedOut
                    }) {
                    _logger.LogError(
                        ex,
                        "SevenCs validation timed out. Skipping validation for now. DatasetName: {DatasetName}. Edition: {Edition}. Update: {Update}.",
                        targetDatasetName,
                        edition,
                        update
                    );
                }
                catch (Exception ex) {
                    throw ExportValidationException.Unavailable(targetDatasetName, ex);
                }
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

        EncPackage? active = null;
        if (packages is not null) {
            var sourceName = ResolveSourceDatasetName(targetDatasetName, productSpecification);
            active = (await packages.GetActiveAsync([sourceName], cancellationToken, includeSourceYaml: false)).GetValueOrDefault(sourceName);
        }
        if (!track.CandidateEdition.HasValue || !track.CandidateUpdate.HasValue) {
            if (active is null || active.ErrorMessage is null && track.State is not (ProductState.Error or ProductState.Rejected))
                throw new ExportOperationRejectedException("There is no unverified candidate export to discard.");
            beforeMutation?.Invoke();
            await packages!.DiscardAsync(targetDatasetName, productSpecification, cancellationToken);
            return new ExportOperationResult(ExportOperationContract.CancelExportCompletedCode, "The failed ENC candidate was discarded.");
        }
        if (track.State is ProductState.InTransit or ProductState.AcceptedForDistribution or ProductState.Published)
            throw new ExportOperationRejectedException($"A candidate in state {track.State} cannot be discarded.");

        beforeMutation?.Invoke();
        var engine = _exportEngines.GetRequiredEngine(productSpecification);
        await engine.DeleteOutputAsync(new ExportOutputIdentity(targetDatasetName, productSpecification, track.CandidateEdition.Value, track.CandidateUpdate.Value, _electronicProductManager.OutputFolder), cancellationToken);
        await _workflowRepository.CancelCandidateAsync(track.Id, user, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
        if (active is not null)
            await packages!.DiscardAsync(targetDatasetName, productSpecification, cancellationToken);
        _logger.LogInformation("Unverified candidate export discarded. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}.", targetDatasetName, productSpecification);
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
        if (track.IsManuallyFrozen)
            throw new ExportOperationRejectedException($"An export could not be created now because the {track.ProductSpecification} product has a manual freeze hold.");
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
        OperationCanceledException => (
            ExportJobContract.OperationCancelledCode,
            ExportJobContract.OperationCancelledMessage
        ),
        _ => (exception.GetType().Name, "The export failed. Contact support and provide the dataset name and failure time.")
    };
}
