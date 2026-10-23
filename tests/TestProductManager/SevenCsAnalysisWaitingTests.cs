using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.SevenCs;

namespace TestProductCatalogueAPI;

public class SevenCsAnalysisWaitingTests
{
    private const string DirectoryName = "TEST-generation";
    private const string DatasetName = "TEST.000";

    [Theory]
    [InlineData(DatasetStatus.Uploaded)]
    [InlineData(DatasetStatus.PendingAnalysis)]
    [InlineData(DatasetStatus.BeingAnalyzed)]
    public async Task LongAnalysis_ContinuesBeyondTheFormer120PollLimit(DatasetStatus pendingStatus)
    {
        var requests = 0;
        using var handler = new TestHandler((_, _) => Task.FromResult(StatusResponse(
            ++requests <= 150 ? pendingStatus : DatasetStatus.Analyzed)));
        using var client = new HttpClient(handler);
        var pauses = 0;
        var service = CreateService(client, _ => { pauses++; return Task.CompletedTask; });

        await service.WaitForAnalysisAsync(DirectoryName, DatasetName, CancellationToken.None);

        Assert.Equal(151, handler.RequestCount);
        Assert.Equal(150, pauses);
    }

    [Fact]
    public async Task StatusLifecycle_CompletesOnlyAfterAnalyzed()
    {
        var statuses = new Queue<DatasetStatus>([
            DatasetStatus.Uploaded, DatasetStatus.PendingAnalysis,
            DatasetStatus.BeingAnalyzed, DatasetStatus.Analyzed,
        ]);
        using var handler = new TestHandler((request, _) => {
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("/api/dataset-status", request.RequestUri!.AbsolutePath);
            Assert.Contains("directory-name=" + DirectoryName, request.RequestUri.Query);
            Assert.Contains("dataset-name=" + DatasetName, request.RequestUri.Query);
            return Task.FromResult(StatusResponse(statuses.Dequeue()));
        });
        using var client = new HttpClient(handler);

        await CreateService(client).WaitForAnalysisAsync(DirectoryName, DatasetName, CancellationToken.None);

        Assert.Equal(4, handler.RequestCount);
        Assert.Empty(statuses);
    }

    [Theory]
    [InlineData(DatasetStatus.FailedToAnalyze)]
    [InlineData(DatasetStatus.ProductSpecificationNotLicensed)]
    public async Task TerminalFailure_IsReportedWithoutFurtherPolling(DatasetStatus status)
    {
        using var handler = new TestHandler((_, _) => Task.FromResult(StatusResponse(status)));
        using var client = new HttpClient(handler);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService(client).WaitForAnalysisAsync(DirectoryName, DatasetName, CancellationToken.None));

        Assert.Contains(status.ToString(), exception.Message);
        Assert.Contains(DatasetName, exception.Message);
        Assert.Equal(1, handler.RequestCount);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.Forbidden)]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task HttpFailure_IsNotMisreportedAsAnAnalysisStillRunning(HttpStatusCode status)
    {
        using var handler = new TestHandler((_, _) => Task.FromResult(new HttpResponseMessage(status)));
        using var client = new HttpClient(handler);

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            CreateService(client).WaitForAnalysisAsync(DirectoryName, DatasetName, CancellationToken.None));

        Assert.Equal(status, exception.StatusCode);
        Assert.Equal(1, handler.RequestCount);
    }

    [Theory]
    [InlineData("")]
    [InlineData("\"UnknownStatus\"")]
    [InlineData("7")]
    [InlineData("{}")]
    public async Task UnknownStatus_FailsClearlyInsteadOfWaitingForever(string content)
    {
        using var handler = new TestHandler((_, _) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
            Content = new StringContent(content),
        }));
        using var client = new HttpClient(handler);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            CreateService(client).WaitForAnalysisAsync(DirectoryName, DatasetName, CancellationToken.None));

        Assert.Contains("unknown analysis status", exception.Message);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task AlreadyCancelled_DoesNotSendAStatusRequest()
    {
        using var handler = new TestHandler((_, _) => Task.FromResult(StatusResponse(DatasetStatus.Analyzed)));
        using var client = new HttpClient(handler);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateService(client).WaitForAnalysisAsync(DirectoryName, DatasetName, cancellation.Token));

        Assert.Equal(0, handler.RequestCount);
    }

    [Fact]
    public async Task CancellationDuringPollingPause_StopsWaiting()
    {
        using var handler = new TestHandler((_, _) => Task.FromResult(StatusResponse(DatasetStatus.BeingAnalyzed)));
        using var client = new HttpClient(handler);
        using var cancellation = new CancellationTokenSource();
        var pauseEntered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var service = CreateService(client, token => {
            pauseEntered.TrySetResult(true);
            return Task.Delay(Timeout.Infinite, token);
        });
        var pending = service.WaitForAnalysisAsync(DirectoryName, DatasetName, cancellation.Token);

        // This bound protects the test harness; production validation has no deadline.
        await pauseEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task CancellationDuringHttpRequest_ReachesTheHandler()
    {
        var requestEntered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        using var handler = new TestHandler(async (_, token) => {
            requestEntered.TrySetResult(true);
            await Task.Delay(Timeout.Infinite, token);
            return StatusResponse(DatasetStatus.Analyzed);
        });
        using var client = new HttpClient(handler);
        using var cancellation = new CancellationTokenSource();
        var pending = CreateService(client).WaitForAnalysisAsync(DirectoryName, DatasetName, cancellation.Token);

        await requestEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public void HttpClient_HasNoImplicit100SecondDeadline()
    {
        using var handler = new TestHandler((_, _) => Task.FromResult(StatusResponse(DatasetStatus.Analyzed)));
        using var client = new HttpClient(handler);

        CreateService(client);

        Assert.Equal(Timeout.InfiniteTimeSpan, client.Timeout);
    }

    [Theory]
    [InlineData(HttpStatusCode.BadRequest)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task RejectedAnalyzeRequest_FailsBeforeStatusPolling(HttpStatusCode status)
    {
        var outputRoot = Path.Combine(Path.GetTempPath(), "SevenCsWaitingTests-" + Guid.NewGuid().ToString("N"));
        const string datasetName = "101DK003TEST1";
        try {
            var datasetPath = ExportOutputPath.GetS101DatasetFilesDirectory(outputRoot, datasetName, 1, 0);
            Directory.CreateDirectory(datasetPath);
            await File.WriteAllTextAsync(Path.Combine(datasetPath, datasetName + ".000"), "Disposable test input");
            using var handler = new TestHandler((request, _) => Task.FromResult(new HttpResponseMessage(
                request.RequestUri!.AbsolutePath switch {
                    "/api/test/expert-user" => HttpStatusCode.OK,
                    "/api/dataset" => HttpStatusCode.OK,
                    "/api/analyze" => status,
                    _ => throw new InvalidOperationException("Unexpected request after a rejected analysis submission."),
                })));
            using var client = new HttpClient(handler);

            var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
                CreateService(client).ValidateDatasetAsync(datasetName, 1, 0, outputRoot));

            Assert.Equal(status, exception.StatusCode);
            Assert.Equal(3, handler.RequestCount);
        }
        finally {
            if (Directory.Exists(outputRoot))
                Directory.Delete(outputRoot, recursive: true);
        }
    }

    [Fact]
    public async Task CancellationDuringAuthorizationProbe_IsNotSwallowed()
    {
        var outputRoot = Path.Combine(Path.GetTempPath(), "SevenCsWaitingTests-" + Guid.NewGuid().ToString("N"));
        const string datasetName = "101DK003TEST1";
        try {
            var datasetPath = ExportOutputPath.GetS101DatasetFilesDirectory(outputRoot, datasetName, 1, 0);
            Directory.CreateDirectory(datasetPath);
            await File.WriteAllTextAsync(Path.Combine(datasetPath, datasetName + ".000"), "Disposable test input");
            var requestEntered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            using var handler = new TestHandler(async (request, token) => {
                Assert.Equal("/api/test/expert-user", request.RequestUri!.AbsolutePath);
                requestEntered.TrySetResult(true);
                await Task.Delay(Timeout.Infinite, token);
                return new HttpResponseMessage(HttpStatusCode.OK);
            });
            using var client = new HttpClient(handler);
            using var cancellation = new CancellationTokenSource();
            var pending = CreateService(client).ValidateDatasetAsync(datasetName, 1, 0, outputRoot, cancellation.Token);

            await requestEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            cancellation.Cancel();

            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending.WaitAsync(TimeSpan.FromSeconds(5)));
            Assert.Equal(1, handler.RequestCount);
        }
        finally {
            if (Directory.Exists(outputRoot))
                Directory.Delete(outputRoot, recursive: true);
        }
    }

    private static SevenCsService CreateService(HttpClient client, Func<CancellationToken, Task>? pause = null) =>
        new(NullLogger<SevenCsService>.Instance, client, pause ?? (_ => Task.CompletedTask));

    private static HttpResponseMessage StatusResponse(DatasetStatus status) => new(HttpStatusCode.OK) {
        Content = new StringContent("\"" + status + "\""),
    };

    private sealed class TestHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            return respond(request, cancellationToken);
        }
    }
}
