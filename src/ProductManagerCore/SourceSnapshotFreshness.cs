using System.Text.Json;
using System.Text.Json.Nodes;

namespace S100FC.ProductCatalogue;

/// <summary>Retains only managed source bindings for one changed row; no ArcGIS resource leaves its execution lane.</summary>
/// <param name="TableName">Source dataset name obtained from the opened ArcGIS table.</param>
/// <param name="Id">Canonical GlobalID of the changed source row.</param>
/// <param name="Code">S-101 feature or information type code.</param>
/// <param name="Attributes">Flattened source attributes.</param>
/// <param name="InformationBindings">Outgoing information associations.</param>
/// <param name="FeatureBindings">Outgoing feature associations.</param>
internal sealed record SourceSnapshotAttributes(string TableName, Guid Id, string Code, string? Attributes, string? InformationBindings, string? FeatureBindings);

/// <summary>Identifies a stale or concurrently changed source read without including attribute payloads in errors.</summary>
internal sealed class SourceSnapshotMismatchException : InvalidOperationException
{
    /// <summary>Creates a bounded, contextual mismatch suitable for one read-only retry.</summary>
    /// <param name="datasetName">ENC dataset whose snapshot was rejected.</param>
    /// <param name="row">Source identity, without logging its attribute values.</param>
    /// <param name="field">Binding field or archive-presence condition that disagreed.</param>
    internal SourceSnapshotMismatchException(string datasetName, SourceSnapshotAttributes row, string field)
        : base($"S-101 source snapshot for '{datasetName}' disagrees with the current archive. Table: {row.TableName}. FeatureId: {row.Id:B}. Field: {field}. No candidate was created from this snapshot.") { }
}

/// <summary>Rejects changed rows whose export read differs from the live archive, independently of ID membership checks.</summary>
internal static class SourceSnapshotFreshness
{
    /// <summary>Checks current archive bindings, allowing JSON formatting and property-order differences.</summary>
    /// <param name="datasetName">Dataset being rebuilt.</param>
    /// <param name="read">Values actually read for export.</param>
    /// <param name="archived">Current live archive row, or null if it was deleted or cannot be found.</param>
    /// <exception cref="SourceSnapshotMismatchException">A current binding or identity no longer matches the export read.</exception>
    /// <exception cref="InvalidDataException">Binding JSON is invalid; retrying a cache refresh cannot repair invalid content.</exception>
    internal static void RequireMatch(string datasetName, SourceSnapshotAttributes read, SourceSnapshotAttributes? archived) {
        string? field = archived is null ? "current archive row missing" :
            read.Id != archived.Id ? "GLOBALID" :
            !string.Equals(read.Code, archived.Code, StringComparison.Ordinal) ? "code" :
            !JsonEquals(read.Attributes, archived.Attributes) ? "attributebindings" :
            !JsonEquals(read.InformationBindings, archived.InformationBindings) ? "informationbindings" :
            !JsonEquals(read.FeatureBindings, archived.FeatureBindings) ? "featurebindings" : null;
        if (field is not null)
            throw new SourceSnapshotMismatchException(datasetName, read, field);
    }

    /// <summary>Retries a rejected read once; cancellation, compiler failures and other source errors are never retried here.</summary>
    /// <typeparam name="T">Read-only snapshot result.</typeparam>
    /// <param name="read">Creates a fresh snapshot and owns all resources for that attempt.</param>
    /// <param name="onRetry">Reports the first mismatch without changing source data.</param>
    /// <param name="cancellationToken">Cancels before either read attempt.</param>
    /// <returns>The first archive-consistent result.</returns>
    /// <exception cref="SourceSnapshotMismatchException">Both reads disagree with the current archive.</exception>
    /// <exception cref="OperationCanceledException">Cancellation was requested.</exception>
    internal static async Task<T> ReadWithRetryAsync<T>(Func<CancellationToken, Task<T>> read, Action<SourceSnapshotMismatchException> onRetry, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        try { return await read(cancellationToken); }
        catch (SourceSnapshotMismatchException exception) {
            cancellationToken.ThrowIfCancellationRequested();
            onRetry(exception);
        }
        cancellationToken.ThrowIfCancellationRequested();
        return await read(cancellationToken);
    }

    /// <summary>Compares binding content without treating whitespace or object property order as changes.</summary>
    /// <param name="left">First optional JSON payload.</param>
    /// <param name="right">Second optional JSON payload.</param>
    /// <returns>Whether both payloads represent the same JSON value.</returns>
    /// <exception cref="InvalidDataException">Either nonempty payload is invalid JSON; its contents are excluded from the error.</exception>
    private static bool JsonEquals(string? left, string? right) {
        try {
            return JsonNode.DeepEquals(string.IsNullOrWhiteSpace(left) ? null : JsonNode.Parse(left),
                string.IsNullOrWhiteSpace(right) ? null : JsonNode.Parse(right));
        }
        catch (JsonException) {
            throw new InvalidDataException("S-101 source snapshot binding JSON is invalid; snapshot consistency could not be verified.");
        }
    }
}
