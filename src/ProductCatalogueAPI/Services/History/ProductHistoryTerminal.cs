using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;
using System.Globalization;

namespace ProductCatalogueAPI.Services.History;

/// <summary>A single application-owned Hangfire parameter; partial parameter writes cannot prove success.</summary>
public sealed record ProductHistoryTerminal(
    Guid OperationId, string DatasetName, string ExportTarget, string OperationType,
    string JobId, string CorrelationId, ProductHistoryResult Result,
    Guid? StateRecordId, int? ResultEdition, int? ResultUpdate,
    string Code, string Message, string? WarningCode, string? WarningMessage)
{
    public static bool Supports(ExportOperationType type) => type is
        ExportOperationType.NewDataset or ExportOperationType.ExportEdition or ExportOperationType.ExportUpdate;

    public static ProductHistoryTerminal Success(ExportOperationJobRequest request, string jobId, ExportOperationResult result) {
        if (result.StateRecordId is null || result.StateRecordId == Guid.Empty ||
            result.DatasetName is null ||
            ProductHistoryEventContract.NormalizeDatasetName(result.DatasetName) != request.DatasetName ||
            result.ExportTarget != request.ProductSpecification ||
            result.ResultEdition is null or < 1 || result.ResultUpdate is null or < 0 ||
            result.Code != ExportOperationContract.ExportCompletedCode)
            throw new InvalidOperationException("Export completion identity is missing or inconsistent.");

        var outcome = result.Warning is null ? ProductHistoryResult.Succeeded : ProductHistoryResult.SucceededWithWarning;
        var safe = ProductHistorySafeMessages.Resolve(ProductHistoryResult.SucceededWithWarning);
        // A producer's arbitrary message/diagnostic never becomes public recovery data.
        return new(request.OperationId, request.DatasetName, request.ProductSpecification!, request.OperationType.ToString(),
            jobId, request.CorrelationId, outcome, result.StateRecordId, result.ResultEdition, result.ResultUpdate,
            ExportOperationContract.ExportCompletedCode, ExportOperationContract.ExportCompletedMessage,
            result.Warning is null ? null : safe.Code, result.Warning is null ? null : safe.Message);
    }

    public static ProductHistoryTerminal Failure(ExportOperationJobRequest request, string jobId, ProductHistoryResult result) {
        var safe = ProductHistorySafeMessages.Resolve(result);
        return new(request.OperationId, request.DatasetName, request.ProductSpecification!, request.OperationType.ToString(),
            jobId, request.CorrelationId, result, null, null, null, safe.Code, safe.Message, null, null);
    }

    public bool Matches(ProductHistoryEventRecord row) {
        if (row.OperationId != OperationId || row.DatasetName != DatasetName || row.ExportTarget != ExportTarget ||
            row.JobId != JobId || row.CorrelationId != CorrelationId || row.EventType != "Export" ||
            !Enum.TryParse<ExportOperationType>(OperationType, out var operation) || !Supports(operation) ||
            operation.ToString() != OperationType)
            return false;
        if (Result is ProductHistoryResult.Succeeded or ProductHistoryResult.SucceededWithWarning) {
            var safe = ProductHistorySafeMessages.Resolve(ProductHistoryResult.SucceededWithWarning);
            return StateRecordId is not null && StateRecordId != Guid.Empty && ResultEdition is >= 1 && ResultUpdate is >= 0 &&
                Code == ExportOperationContract.ExportCompletedCode && Message == ExportOperationContract.ExportCompletedMessage &&
                (Result == ProductHistoryResult.Succeeded
                    ? WarningCode is null && WarningMessage is null
                    : WarningCode == safe.Code && WarningMessage == safe.Message);
        }
        if (Result is not (ProductHistoryResult.Failed or ProductHistoryResult.RequiresManualReview)) return false;
        var failure = ProductHistorySafeMessages.Resolve(Result);
        return StateRecordId is null && ResultEdition is null && ResultUpdate is null &&
            Code == failure.Code && Message == failure.Message && WarningCode is null && WarningMessage is null;
    }

    public ProductHistoryEventCompletion Completion() => new(OperationId, Result, StateRecordId,
        StateRecordId is null ? null : new Dictionary<string, string?> {
            ["ResultEdition"] = ResultEdition!.Value.ToString(CultureInfo.InvariantCulture),
            ["ResultUpdate"] = ResultUpdate!.Value.ToString(CultureInfo.InvariantCulture)
        });
}
