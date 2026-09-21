using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.ExportRules;
using ProductCatalogueAPI.Services.Locking;
using ProductCatalogueAPI.Services.Operations;

namespace ProductCatalogueAPI.Jobs;

/// <summary>
/// Evaluates open summaries and builds independent product-track exports in parallel. Registration does not schedule this job.
/// </summary>
public sealed class ProcessChangeSummariesJob(IProductWorkflowRepository workflowRepository, IExportDecisionRuleSetRegistry ruleSets, IExportOperationService exportOperations, IDatasetLockService datasetLockService, TimeProvider timeProvider, ILogger<ProcessChangeSummariesJob> logger) : IBackgroundJob
{
    private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
    private readonly IExportDecisionRuleSetRegistry _ruleSets = ruleSets;
    private readonly IExportOperationService _exportOperations = exportOperations;
    private readonly IDatasetLockService _datasetLockService = datasetLockService;
    private readonly TimeProvider _timeProvider = timeProvider;
    private readonly ILogger<ProcessChangeSummariesJob> _logger = logger;

    /// <inheritdoc/>
    public async Task RunAsync(CancellationToken cancellationToken) {
        var summaries = await _workflowRepository.GetOpenChangeSummariesAsync(cancellationToken);
        await Task.WhenAll(summaries.Select(summary => ProcessSummaryAsync(summary, cancellationToken)));
    }

    private async Task ProcessSummaryAsync(Data.Models.ProductChangeSummary summary, CancellationToken cancellationToken) {
        var decision = _ruleSets.GetRequired(summary.ProductSpecification).Evaluate(summary);
        if (!decision.RevisionType.HasValue) {
            _logger.LogInformation("Change-summary export deferred by ruleset. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. Reason: {Reason}.", summary.DatasetName, summary.ProductSpecification, decision.Reason);
            return;
        }

        await using var datasetLock = await _datasetLockService.TryAcquireAsync(ProductTrackLockKey.For(summary.DatasetName, summary.ProductSpecification), cancellationToken);
        if (datasetLock is null) {
            _logger.LogWarning("Change-summary export skipped because its independent track lock is held. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}.", summary.DatasetName, summary.ProductSpecification);
            return;
        }

        // Freezing is an intentional operator hold, so defer this summary without failing the batch.
        var track = await _workflowRepository.GetTrackAsync(summary.DatasetName, summary.ProductSpecification, cancellationToken);
        if (track?.IsManuallyFrozen == true) {
            _logger.LogInformation("Change-summary export deferred because the product track has a manual freeze hold. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. TrackId: {TrackId}.", summary.DatasetName, summary.ProductSpecification, summary.TrackId);
            return;
        }

        var revisionType = decision.RevisionType.Value;
        var operationType = revisionType == ExportRevisionType.Update
            ? ExportOperationType.ExportUpdate
            : ExportOperationType.ExportEdition;
        if (track?.PublishedEdition == 0) {
            // An imported product with edition zero has no edition history yet. Its first
            // export is a NewDataset operation, but it uses the NewEdition build pipeline.
            operationType = ExportOperationType.NewDataset;
            revisionType = ExportRevisionType.NewEdition;
        }

        _logger.LogInformation(
            "Change-summary export selected. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. OperationType: {OperationType}. RevisionType: {RevisionType}. PublishedEdition: {PublishedEdition}.",
            summary.DatasetName,
            summary.ProductSpecification,
            operationType,
            revisionType,
            track?.PublishedEdition
        );

        try {
            await _exportOperations.ExecuteExportAsync(summary.DatasetName, revisionType, "system", summary.Yaml, cancellationToken);
        }
        catch (ExportOperationRejectedException) {
            var currentTrack = await _workflowRepository.GetTrackAsync(summary.DatasetName, summary.ProductSpecification, cancellationToken);
            if (currentTrack?.IsManuallyFrozen != true)
                throw;

            _logger.LogInformation("Change-summary export deferred because the product track acquired a manual freeze hold during processing. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}. TrackId: {TrackId}.", summary.DatasetName, summary.ProductSpecification, summary.TrackId);
            return;
        }

        await _workflowRepository.CloseChangeSummaryAsync(summary.Id, _timeProvider.GetUtcNow().UtcDateTime, cancellationToken);
    }
}
