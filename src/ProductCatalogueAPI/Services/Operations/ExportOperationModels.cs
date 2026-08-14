using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Operations;

/// <summary>Identifies a background export workflow operation.</summary>
public enum ExportOperationType
{
    /// <summary>Builds a new edition candidate.</summary>
    ExportEdition,

    /// <summary>Builds an update candidate.</summary>
    ExportUpdate,

    /// <summary>Cancels and removes an unverified candidate.</summary>
    CancelExport
}

/// <summary>Represents a non-fatal operation warning.</summary>
public sealed record ExportOperationWarning(string Code, string Message);

/// <summary>Represents the safe public result of an export operation.</summary>
public sealed record ExportOperationResult(string Code, string Message, ExportOperationWarning? Warning = null);

/// <summary>Indicates that a read-only product snapshot could not be serialized.</summary>
public sealed class ExportSourceUnavailableException(string datasetName) : Exception($"The generated dataset for '{datasetName}' could not be serialized.")
{
    /// <summary>Gets the affected dataset name.</summary>
    public string DatasetName { get; } = datasetName;
}

/// <summary>Indicates that a requested operation conflicts with the current durable workflow state.</summary>
public sealed class ExportOperationRejectedException(string message) : InvalidOperationException(message);

/// <summary>Indicates that an export was generated but could not pass or complete product validation.</summary>
public sealed class ExportValidationException : Exception
{
    private ExportValidationException(string datasetName, string code, string publicMessage, Exception? innerException = null) : base(publicMessage, innerException) {
        DatasetName = datasetName;
        Code = code;
        PublicMessage = publicMessage;
    }

    /// <summary>Gets the affected dataset name.</summary>
    public string DatasetName { get; }

    /// <summary>Gets the stable failure code persisted with workflow history.</summary>
    public string Code { get; }

    /// <summary>Gets the safe message returned to clients and shown in product details.</summary>
    public string PublicMessage { get; }

    /// <summary>Creates a failure caused by validation findings.</summary>
    public static ExportValidationException Findings(string datasetName, int errors, int critical, bool shallowIsolatedDangersUpdatedBathy) {
        var updateFinding = shallowIsolatedDangersUpdatedBathy ? " It also flagged ShallowIsolatedDangersUpdatedBathy." : string.Empty;
        return new(datasetName, "SEVENCS_VALIDATION_FAILED", $"SevenCs validation failed for '{datasetName}' with {errors} errors and {critical} critical findings.{updateFinding} Download the validation diagnostics for details.");
    }

    /// <summary>Creates a failure caused by the validation service being unavailable or incomplete.</summary>
    public static ExportValidationException Unavailable(string datasetName, Exception innerException) => new(datasetName, "SEVENCS_VALIDATION_UNAVAILABLE", $"SevenCs validation could not be completed for '{datasetName}'. Try again or contact support if the problem continues.", innerException);
}

/// <summary>Defines stable public values and result codes for export operations.</summary>
public static class ExportOperationContract
{
    public const string ExportCompletedCode = "EXPORT_READY_FOR_DISTRIBUTION";
    public const string ExportCompletedMessage = "The candidate export was generated and validated. It has not been published to S-128.";
    public const string CancelExportCompletedCode = "CANCEL_EXPORT_COMPLETED";
    public const string CancelExportCompletedMessage = "The unverified candidate export was cancelled.";

    /// <summary>Converts an operation type to its stable API/job value.</summary>
    public static string ToPublicValue(ExportOperationType operationType) => operationType.ToString();

    /// <summary>Parses a stable API/job operation value.</summary>
    public static ExportOperationType ParsePublicValue(string value) => Enum.TryParse<ExportOperationType>(value, ignoreCase: false, out var operationType)
        ? operationType
        : throw new ArgumentException("Unknown Product Catalogue operation type.", nameof(value));

    /// <summary>Converts a product specification to its public export-target value.</summary>
    public static string ToPublicExportTarget(ProductSpecification productSpecification) => productSpecification.ToString();
}
