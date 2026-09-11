using System.Globalization;
using System.Text.Json;

namespace ProductCatalogueAPI.Services.History;

public static class ProductHistoryEventContract
{
    // Versioned SQL scripts freeze these limits; change both through a new migration.
    public const int DatasetNameMaxLength = 256;
    public const int EventTypeMaxLength = 64;
    public const int OutcomeMaxLength = 32;
    public const int CodeMaxLength = 128;
    public const int SafeMessageMaxLength = 1024;
    public const int CorrelationIdMaxLength = 128;
    public const int JobIdMaxLength = 128;
    public const int ExportTargetMaxLength = 32;
    public const int OperationMetadataJsonMaxLength = 4000;
    public const int MetadataMaxEntries = 8;
    public const int MetadataKeyMaxLength = 64;
    public const int MetadataValueMaxLength = 256;

    public const string Succeeded = "Succeeded";
    public const string Failed = "Failed";
    public const string SucceededWithWarning = "SucceededWithWarning";
    public const string RequiresManualReview = "RequiresManualReview";

    public static string NormalizeDatasetName(string? value)
    {
        var canonical = value?.Trim().ToUpperInvariant();
        return RequiredText(canonical, DatasetNameMaxLength, nameof(value));
    }

    public static string NormalizeEventType(string value)
    {
        var text = RequiredText(value, EventTypeMaxLength, nameof(value));
        return new[] { "Export", "Rollback" }.FirstOrDefault(x => x.Equals(text, StringComparison.OrdinalIgnoreCase))
            ?? throw new ArgumentException("Unsupported audit event type.", nameof(value));
    }

    public static string? NormalizeExportTarget(string? value)
    {
        if (value == null) return null;
        var text = NormalizeToken(value, ExportTargetMaxLength, nameof(value));
        return text!.ToUpperInvariant();
    }

    public static string? NormalizeToken(string? value, int maxLength, string field)
    {
        if (value == null) return null;
        var text = RequiredText(value, maxLength, field);
        if (text.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-' && c != '_' && c != '.' && c != ':'))
            throw new ArgumentException("Audit identifiers must be diagnostic tokens, not free text.", field);
        return text;
    }

    public static void RequireIdentity(Guid value, string field)
    {
        if (value == Guid.Empty) throw new ArgumentException("An application-generated identity is required.", field);
    }

    public static string? SerializeMetadata(IReadOnlyDictionary<string, string?>? values)
    {
        if (values == null) return null;
        if (values.Count > MetadataMaxEntries) throw new ArgumentException("Too many audit metadata entries.", nameof(values));
        var safe = new SortedDictionary<string, string?>(StringComparer.Ordinal);
        foreach (var entry in values)
        {
            var key = RequiredText(entry.Key, MetadataKeyMaxLength, nameof(values));
            var value = entry.Value == null ? null : RequiredText(entry.Value, MetadataValueMaxLength, nameof(values));
            // Only reviewed version numbers are public metadata. New keys need a catalog review.
            if (key is not ("ResultEdition" or "ResultUpdate" or "PreviousEdition" or "PreviousUpdate"))
                throw new ArgumentException("Unsupported audit metadata key.", nameof(values));
            if (value != null && (!uint.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var number) ||
                value != number.ToString(CultureInfo.InvariantCulture)))
                throw new ArgumentException("Audit version metadata must be a canonical non-negative integer.", nameof(values));
            if (!safe.TryAdd(key, value)) throw new ArgumentException("Duplicate audit metadata key.", nameof(values));
        }
        var json = JsonSerializer.Serialize(safe);
        if (json.Length > OperationMetadataJsonMaxLength) throw new ArgumentException("Audit metadata is too long.", nameof(values));
        return json;
    }

    internal static string RequiredText(string? value, int maxLength, string field)
    {
        var text = value?.Trim();
        if (string.IsNullOrEmpty(text) || text.Length > maxLength || text.Any(char.IsControl))
            throw new ArgumentException("Audit field is missing, overlong, or contains control characters.", field);
        return text;
    }
}

// No caller-provided message, code, outcome, Exception, or raw JSON enters the service.
public enum ProductHistoryResult
{
    Succeeded,
    Failed,
    SucceededWithWarning,
    RequiresManualReview
}

internal static class ProductHistorySafeMessages
{
    internal static (string Outcome, string Code, string Message) Resolve(ProductHistoryResult result)
    {
        var safe = result switch
        {
            ProductHistoryResult.Succeeded => (ProductHistoryEventContract.Succeeded, "OPERATION_SUCCEEDED", "The operation completed successfully."),
            ProductHistoryResult.Failed => (ProductHistoryEventContract.Failed, "OPERATION_FAILED", "The operation did not complete successfully."),
            ProductHistoryResult.SucceededWithWarning => (ProductHistoryEventContract.SucceededWithWarning, "OPERATION_SUCCEEDED_WITH_WARNING", "The operation completed with a warning. Review the operation details."),
            ProductHistoryResult.RequiresManualReview => (ProductHistoryEventContract.RequiresManualReview, "MANUAL_REVIEW_REQUIRED", "The final operation state could not be confirmed. Manual review is required."),
            _ => throw new ArgumentOutOfRangeException(nameof(result))
        };
        return (
            ProductHistoryEventContract.RequiredText(safe.Item1, ProductHistoryEventContract.OutcomeMaxLength, "Outcome"),
            ProductHistoryEventContract.NormalizeToken(safe.Item2, ProductHistoryEventContract.CodeMaxLength, "Code")!,
            ProductHistoryEventContract.RequiredText(safe.Item3, ProductHistoryEventContract.SafeMessageMaxLength, "SafeMessage"));
    }
}
