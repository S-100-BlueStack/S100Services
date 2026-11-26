using System.Net;
using System.Net.Http.Json;
using ProductCatalogueAPI.Contracts;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace ProductCatalogueAPI.Services.BathymetricSurfaces;

/// <summary>Uses the worker's Windows identity to call the existing ProductCatalogue bathymetric routes.</summary>
/// <param name="http">HTTP client configured with the ProductCatalogue API base address and Windows credentials.</param>
internal sealed class BathymetricSurfaceClient(HttpClient http)
{
    /// <summary>Submits or replays a reservation request with a caller-supplied export identifier.</summary>
    /// <param name="request">Stable export identifier and at most 100 normalized dataset names.</param>
    /// <param name="token">Cancels the HTTP request while leaving the API outcome unconfirmed.</param>
    /// <returns>Reservations with canonical names and reserved editions.</returns>
    /// <exception cref="HttpRequestException">The batch is unresolved, including when the API returns HTTP 409.</exception>
    internal async Task<ExternalProductExportResponse[]> ReserveAsync(BathymetricChangeReport request, CancellationToken token) {
        using var response = await http.PostAsJsonAsync("BathymetricSurfaces/changes", request, token);
        var result = await ReadAsync<ApiResponse<ExternalProductExportResponse[]>>(response, $"reserve bathymetric export batch {request.ExportId}", token);
        var names = new HashSet<string>(request.DatasetNames.Select(BathymetricSurfaceService.DatasetStem), StringComparer.OrdinalIgnoreCase);
        if (!result.Success || result.Data is null || result.Data.Length != names.Count
            || result.Data.Any(export => export is null || export.ExportId != request.ExportId || export.Edition is not (> 0)
                || !BathymetricSurfaceService.IsDatasetName(export.DatasetName)
                || !names.Remove(BathymetricSurfaceService.DatasetStem(export.DatasetName))))
            throw new InvalidDataException($"ProductCatalogue returned incomplete or mismatched reservations for bathymetric batch {request.ExportId}.");

        return result.Data;
    }

    /// <summary>Posts completion bytes for one exact reservation and verifies the confirmed outcome.</summary>
    /// <param name="reservation">Canonical name, export identifier and edition returned by the reservation API.</param>
    /// <param name="validationPassed">Whether the export passed validation.</param>
    /// <param name="exchangeSet">Exchange-set ZIP bytes, required on success.</param>
    /// <param name="validationArtifact">Optional VLD diagnostic bytes.</param>
    /// <param name="token">Cancels the upload or response read.</param>
    /// <returns>A task that completes once the API confirms the same export and outcome.</returns>
    internal async Task CompleteAsync(ExternalProductExportResponse reservation, bool validationPassed, byte[]? exchangeSet, byte[]? validationArtifact, CancellationToken token) {
        var route = $"BathymetricSurfaces/{Uri.EscapeDataString(reservation.DatasetName)}/exports/{reservation.ExportId:D}/complete";
        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(validationPassed ? "true" : "false"), "validationPassed");
        if (exchangeSet is { } zip)
            form.Add(new ByteArrayContent(zip), "exchangeSet", "exchange-set.zip");
        if (validationArtifact is { } vld)
            form.Add(new ByteArrayContent(vld), "validationArtifact", "validation.vld");

        using var response = await http.PostAsync(route, form, token);
        var result = await ReadAsync<ApiResponse<ExternalProductExportResponse>>(response, $"complete bathymetric export {reservation.ExportId} for {reservation.DatasetName}", token);
        if (!result.Success || result.Data is not { } export
            || !string.Equals(export.DatasetName, reservation.DatasetName, StringComparison.OrdinalIgnoreCase)
            || export.ExportId != reservation.ExportId || export.Edition != reservation.Edition
            || (validationPassed ? !IsSuccessful(export.Status) : export.Status != ExternalProductExportStatus.Error))
            throw new InvalidDataException($"ProductCatalogue did not confirm bathymetric export {reservation.ExportId} for {reservation.DatasetName}.");
    }

    /// <summary>Recognizes proven successful export states, including later IC-ENC delivery states.</summary>
    /// <param name="status">Status returned for the same export ID.</param>
    /// <returns>Whether successful export completion has already been recorded.</returns>
    private static bool IsSuccessful(ExternalProductExportStatus status) =>
        status is ExternalProductExportStatus.ReadyForDistribution or ExternalProductExportStatus.Sending
            or ExternalProductExportStatus.Submitted or ExternalProductExportStatus.DeliveryNeedsReview;

    /// <summary>Reads the expected response without including arbitrary response bodies or URIs in errors.</summary>
    /// <typeparam name="T">Expected JSON response type.</typeparam>
    /// <param name="response">Response owned by the caller.</param>
    /// <param name="operation">Diagnostic description containing only safe operation identifiers.</param>
    /// <param name="token">Cancels deserialization.</param>
    /// <returns>The deserialized response body.</returns>
    private static async Task<T> ReadAsync<T>(HttpResponseMessage response, string operation, CancellationToken token) where T : class {
        if (response.StatusCode == HttpStatusCode.Conflict)
            throw new HttpRequestException($"Could not {operation}. ProductCatalogue returned HTTP 409.", null, response.StatusCode);
        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Could not {operation}. ProductCatalogue returned HTTP {(int)response.StatusCode}.", null, response.StatusCode);

        return await response.Content.ReadFromJsonAsync<T>(token)
            ?? throw new InvalidDataException($"ProductCatalogue returned an empty response while attempting to {operation}.");
    }

    /// <summary>Validates the configured ProductCatalogue base address and preserves any IIS application path.</summary>
    /// <param name="http">Client to configure.</param>
    /// <param name="configuration">Worker configuration containing BathymetricChangeDetection:ApiBaseUrl.</param>
    internal static void Configure(HttpClient http, IConfiguration configuration) {
        if (!Uri.TryCreate(configuration["BathymetricChangeDetection:ApiBaseUrl"], UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp)
            || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new InvalidOperationException("Configure BathymetricChangeDetection:ApiBaseUrl with the ProductCatalogue API URL, without credentials, a query or a fragment.");

        http.BaseAddress = new Uri(uri.AbsoluteUri.TrimEnd('/') + '/');
        http.Timeout = TimeSpan.FromMinutes(10);
    }
}
