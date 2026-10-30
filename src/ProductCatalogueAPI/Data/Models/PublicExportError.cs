namespace ProductCatalogueAPI.Data.Models;

/// <summary>Keeps compiler, topology and infrastructure exceptions out of product responses, including older stored failures.</summary>
public static class PublicExportError
{
    public const string GenericMessage = "An error occurred during the export.";

    /// <summary>Only trusted SevenCs validation summaries may replace the generic export failure text.</summary>
    public static string Message(string? code, string? message) =>
        (code is "SEVENCS_VALIDATION_FAILED" or "SEVENCS_VALIDATION_UNAVAILABLE") && !string.IsNullOrWhiteSpace(message)
            ? message : GenericMessage;

    /// <summary>Preserves non-export workflow notices while hiding technical export failure details.</summary>
    public static string? ForState(ProductState state, string? code, string? message) =>
        state is ProductState.Rejected or ProductState.InTransit ? message :
            state == ProductState.Error || !string.IsNullOrWhiteSpace(message) ? Message(code, message) : null;

    public static string? For(ProductRecord? record) => record is null ? null : ForState(record.State, record.ErrorCode, record.ErrorMessage);
    public static string? For(ProductExportTrackRecord? track) => track is null ? null : ForState(track.State, track.ErrorCode, track.ErrorMessage);
}
