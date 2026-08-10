using static ProductCatalogueAPI.Models.RequestTypes;

namespace ProductCatalogueAPI.Services.Operations
{
    public enum ExportOperationType
    {
        ExportEdition,
        Rollback
    }

    public sealed record ExportOperationWarning(string Code, string Message);

    public sealed record ExportOperationResult(
        string Code,
        string Message,
        ExportOperationWarning? Warning = null
    );

    public sealed class ExportSourceUnavailableException(string datasetName)
        : Exception($"The generated dataset for '{datasetName}' could not be serialized.")
    {
        public string DatasetName { get; } = datasetName;
    }

    public sealed class ExportOperationRejectedException(string message)
        : InvalidOperationException(message);

    public static class ExportOperationContract
    {
        public const string ExportCompletedCode = "EXPORT_COMPLETED";
        public const string ExportCompletedMessage = "Export completed.";
        public const string RollbackCompletedCode = "ROLLBACK_COMPLETED";
        public const string RollbackCompletedMessage = "Rollback completed.";
        public const string RollbackCleanupFailedCode = "ROLLBACK_CLEANUP_FAILED";
        public const string RollbackCleanupFailedMessage = "Rollback completed, but old export output could not be fully removed.";

        public static string ToPublicValue(ExportOperationType operationType) => operationType switch {
            ExportOperationType.ExportEdition => "ExportEdition",
            ExportOperationType.Rollback => "Rollback",
            _ => throw new ArgumentOutOfRangeException(nameof(operationType), operationType, null)
        };

        public static ExportOperationType ParsePublicValue(string value) => value switch {
            "ExportEdition" => ExportOperationType.ExportEdition,
            "Rollback" => ExportOperationType.Rollback,
            _ => throw new ArgumentException("Unknown Product Manager operation type.", nameof(value))
        };

        public static string? ToPublicExportTarget(ExportFormat? exportTarget) => exportTarget switch {
            null => null,
            ExportFormat.S100 => "S100",
            _ => throw new ArgumentOutOfRangeException(nameof(exportTarget), exportTarget, "Only S100 is supported.")
        };
    }
}
