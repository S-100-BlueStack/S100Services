using System.IO.Compression;
using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.SevenCs;

namespace TestProductCatalogueAPI;

public sealed class SevenCsExportValidationTests : IDisposable
{
    private const string S57Name = "DK3BIDQE";
    private const string S101Name = "101DK001";
    private readonly string _root = Path.Combine(Path.GetTempPath(), $"pc-sevencs-export-{Guid.NewGuid():N}");
    private string? _diagnosticsDirectory;

    [Theory]
    [InlineData(ProductSpecification.S57, false, false)]
    [InlineData(ProductSpecification.S57, true, false)]
    [InlineData(ProductSpecification.S101, false, false)]
    [InlineData(ProductSpecification.S101, false, true)]
    public async Task CandidateUploadsOnlyItsOwnCellInOrderAndReturnsBothDiagnostics(ProductSpecification specification, bool nested, bool legacyOverload) {
        var name = specification == ProductSpecification.S57 ? S57Name : S101Name;
        var directory = CreateDatasetDirectory(specification, name, update: 2, nested);
        // Write updates out of order and add names that a prefix match would incorrectly upload.
        await File.WriteAllBytesAsync(Path.Combine(directory, name + ".002"), [2]);
        await File.WriteAllBytesAsync(Path.Combine(directory, name + ".000"), [0]);
        await File.WriteAllBytesAsync(Path.Combine(directory, name + ".001"), [1]);
        await File.WriteAllBytesAsync(Path.Combine(directory, name + "OTHER.000"), [99]);
        await File.WriteAllBytesAsync(Path.Combine(directory, name + "OTHER.003"), [99]);
        await File.WriteAllTextAsync(Path.Combine(directory, name + ".yaml"), "staging YAML");
        await File.WriteAllBytesAsync(Path.Combine(directory, "CATALOG.031"), [99]);
        if (specification == ProductSpecification.S57) {
            var previous = CreateDatasetDirectory(specification, name, update: 1, nested);
            await File.WriteAllBytesAsync(Path.Combine(previous, name + ".000"), [99]);
            await File.WriteAllBytesAsync(Path.Combine(previous, name + ".099"), [99]);
        }
        using var handler = new ValidationHandler();
        using var client = new HttpClient(handler);
        var service = CreateService(client);

        var result = legacyOverload
            ? await service.ValidateDatasetAsync(name, 5, 2, _root)
            : await service.ValidateDatasetAsync(name, specification, 5, 2, _root);
        RememberDiagnosticsDirectory(handler);

        Assert.Equal(new[] { name + ".000", name + ".001", name + ".002" }, handler.Uploads.Select(upload => upload.Name));
        Assert.Equal(new byte[] { 0, 1, 2 }, handler.Uploads.SelectMany(upload => upload.Content).ToArray());
        Assert.Equal(handler.Uploads.Select(upload => upload.Name), handler.AnalyzedDatasets);
        Assert.Equal(name + ".002", handler.SummaryDataset);
        Assert.Equal(name, result.Summary.DSNM);
        Assert.Equal(3, result.Summary.Errors);
        Assert.True(result.Summary.ShallowIsolatedDangersUpdatedBathy);
        var log = Assert.Single(result.Diagnostics, artifact => artifact.FileName == name + ".vld");
        Assert.Equal("text/plain", log.MediaType);
        Assert.Equal(ValidationHandler.LogContent, Encoding.UTF8.GetString(log.Content));
        Assert.Equal(log.Content, await File.ReadAllBytesAsync(Path.Combine(_diagnosticsDirectory!, log.FileName)));
        var shapes = Assert.Single(result.Diagnostics, artifact => artifact.FileName == name + "-validation-shapes.zip");
        Assert.Equal("application/zip", shapes.MediaType);
        using var archive = new ZipArchive(new MemoryStream(shapes.Content), ZipArchiveMode.Read);
        Assert.NotNull(archive.GetEntry("diagnostics.txt"));
        Assert.True(File.Exists(Path.Combine(_diagnosticsDirectory!, "diagnostics.txt")));
    }

    [Theory]
    [InlineData(ProductSpecification.S57)]
    [InlineData(ProductSpecification.S101)]
    public async Task SuccessfulUploadRetryIsIncludedInTheAnalysisRequest(ProductSpecification specification) {
        var name = specification == ProductSpecification.S57 ? S57Name : S101Name;
        var directory = CreateDatasetDirectory(specification, name, 0, nested: true);
        await File.WriteAllBytesAsync(Path.Combine(directory, name + ".000"), [1]);
        using var handler = new ValidationHandler { RejectFirstUpload = true };
        using var client = new HttpClient(handler);

        var result = await CreateService(client).ValidateDatasetAsync(name, specification, 5, 0, _root);
        RememberDiagnosticsDirectory(handler);

        Assert.Equal(2, handler.UploadAttempts);
        Assert.Equal(name + ".000", Assert.Single(handler.AnalyzedDatasets));
        Assert.Equal(name, result.Summary.DSNM);
        Assert.False(result.Summary.ShallowIsolatedDangersUpdatedBathy);
    }

    [Fact]
    public async Task MissingDiagnosticDownloadsDoNotHideAnS57ValidationSummary() {
        var directory = CreateDatasetDirectory(ProductSpecification.S57, S57Name, 0, nested: true);
        await File.WriteAllBytesAsync(Path.Combine(directory, S57Name + ".000"), [1]);
        using var handler = new ValidationHandler { DiagnosticStatus = HttpStatusCode.NotFound };
        using var client = new HttpClient(handler);

        var result = await CreateService(client).ValidateDatasetAsync(S57Name, ProductSpecification.S57, 5, 0, _root);
        RememberDiagnosticsDirectory(handler);

        Assert.Equal(3, result.Summary.Errors);
        Assert.Empty(result.Diagnostics);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("empty")]
    [InlineData("ambiguous")]
    public async Task InvalidS57OutputCannotUploadAnotherCellOrPickAnArbitraryBase(string scenario) {
        var directory = CreateDatasetDirectory(ProductSpecification.S57, S57Name, 0, nested: false);
        await File.WriteAllBytesAsync(Path.Combine(directory, "OTHER.000"), [99]);
        if (scenario != "missing")
            await File.WriteAllBytesAsync(Path.Combine(directory, S57Name + ".000"), scenario == "empty" ? [] : [1]);
        if (scenario == "ambiguous") {
            var duplicate = Path.Combine(directory, "duplicate");
            Directory.CreateDirectory(duplicate);
            await File.WriteAllBytesAsync(Path.Combine(duplicate, S57Name + ".000"), [2]);
        }
        using var handler = new ValidationHandler();
        using var client = new HttpClient(handler);

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService(client).ValidateDatasetAsync(S57Name, ProductSpecification.S57, 5, 0, _root));

        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task CancelledS57ValidationStopsBeforeLookingForOutputOrSendingRequests() {
        using var handler = new ValidationHandler();
        using var client = new HttpClient(handler);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateService(client).ValidateDatasetAsync(S57Name, ProductSpecification.S57, 5, 0, _root, cancellation.Token));

        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task UnsupportedFormatCannotFallBackToTheS101Layout() {
        using var handler = new ValidationHandler();
        using var client = new HttpClient(handler);

        await Assert.ThrowsAsync<NotSupportedException>(() =>
            CreateService(client).ValidateDatasetAsync(S57Name, ProductSpecification.S102, 5, 0, _root));

        Assert.Equal(0, handler.RequestCount);
    }

    private string CreateDatasetDirectory(ProductSpecification specification, string name, int update, bool nested) {
        var directory = specification == ProductSpecification.S101
            ? ExportOutputPath.GetS101DatasetFilesDirectory(_root, name, 5, update)
            : ExportOutputPath.GetCandidateDirectory(_root, name, specification, 5, update);
        if (specification == ProductSpecification.S57 && nested)
            directory = Path.Combine(directory, "ENC_ROOT", "cells");
        Directory.CreateDirectory(directory);
        return directory;
    }

    private static SevenCsService CreateService(HttpClient client) =>
        new(NullLogger<SevenCsService>.Instance, client, _ => Task.CompletedTask);

    private void RememberDiagnosticsDirectory(ValidationHandler handler) {
        Assert.NotNull(handler.DirectoryName);
        // The server directory ends in the standard 36-character GUID used locally.
        var uuid = handler.DirectoryName![^36..];
        _diagnosticsDirectory = Path.Combine(AppContext.BaseDirectory, "SevenCsTemp", uuid);
    }

    public void Dispose() {
        if (Directory.Exists(_root))
            Directory.Delete(_root, recursive: true);
        if (_diagnosticsDirectory is not null && Directory.Exists(_diagnosticsDirectory))
            Directory.Delete(_diagnosticsDirectory, recursive: true);
    }

    private sealed class ValidationHandler : HttpMessageHandler
    {
        public const string LogContent = "ShallowIsolatedDangersUpdatedBathy validation diagnostic";
        public List<(string Name, byte[] Content)> Uploads { get; } = [];
        public List<string> AnalyzedDatasets { get; } = [];
        public string? DirectoryName { get; private set; }
        public string? SummaryDataset { get; private set; }
        public int UploadAttempts { get; private set; }
        public int RequestCount { get; private set; }
        public bool RejectFirstUpload { get; init; }
        public HttpStatusCode DiagnosticStatus { get; init; } = HttpStatusCode.OK;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
            RequestCount++;
            switch (request.RequestUri!.AbsolutePath) {
                case "/api/test/expert-user":
                    return new HttpResponseMessage(HttpStatusCode.OK);
                case "/api/dataset": {
                    Assert.Equal(HttpMethod.Put, request.Method);
                    UploadAttempts++;
                    if (RejectFirstUpload && UploadAttempts == 1)
                        return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
                    var parts = Assert.IsType<MultipartFormDataContent>(request.Content).ToArray();
                    var file = Assert.Single(parts, part => FieldName(part) == "file");
                    var directory = Assert.Single(parts, part => FieldName(part) == "directory-name");
                    DirectoryName = await directory.ReadAsStringAsync(cancellationToken);
                    Uploads.Add((file.Headers.ContentDisposition!.FileName!.Trim('"'), await file.ReadAsByteArrayAsync(cancellationToken)));
                    return new HttpResponseMessage(HttpStatusCode.OK);
                }
                case "/api/analyze": {
                    Assert.Equal(HttpMethod.Post, request.Method);
                    var parts = Assert.IsType<MultipartFormDataContent>(request.Content).ToArray();
                    foreach (var part in parts.Where(part => FieldName(part) == "dataset-name"))
                        AnalyzedDatasets.Add(await part.ReadAsStringAsync(cancellationToken));
                    return new HttpResponseMessage(HttpStatusCode.OK);
                }
                case "/api/dataset-status":
                    Assert.Contains("dataset-name=" + Uploads.Last().Name, request.RequestUri.Query);
                    return TextResponse("\"Analyzed\"");
                case "/api/analysis-summary":
                    SummaryDataset = Uploads.Last().Name;
                    Assert.Contains("dataset-name=" + SummaryDataset, request.RequestUri.Query);
                    return new HttpResponseMessage(HttpStatusCode.OK) {
                        Content = new StringContent("{\"numCritical\":0,\"numErrors\":3}", Encoding.UTF8, "application/json")
                    };
                case "/api/analyzer-log":
                    Assert.Contains("analyzer-log-name=" + Path.GetFileNameWithoutExtension(Uploads[0].Name) + ".vld", request.RequestUri.Query);
                    return DiagnosticStatus == HttpStatusCode.OK ? TextResponse(LogContent) : new HttpResponseMessage(DiagnosticStatus);
                case "/api/analyzer-shapefile-log": {
                    Assert.Contains("analyzer-log-name=" + Path.GetFileNameWithoutExtension(Uploads[0].Name) + "_vld", request.RequestUri.Query);
                    if (DiagnosticStatus != HttpStatusCode.OK)
                        return new HttpResponseMessage(DiagnosticStatus);
                    using var buffer = new MemoryStream();
                    using (var archive = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true)) {
                        var entry = archive.CreateEntry("diagnostics.txt");
                        using var writer = new StreamWriter(entry.Open());
                        writer.Write("shapefile diagnostic fixture");
                    }
                    return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(buffer.ToArray()) };
                }
                default:
                    throw new InvalidOperationException("Unexpected SevenCs request: " + request.RequestUri.AbsolutePath);
            }
        }

        private static string? FieldName(HttpContent part) => part.Headers.ContentDisposition?.Name?.Trim('"');
        private static HttpResponseMessage TextResponse(string text) => new(HttpStatusCode.OK) { Content = new StringContent(text) };
    }
}
