using DataCatalague.Api.Configuration;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace DataCatalogue.Api.Tests.Unit;

public sealed class ClientCancellationMiddlewareTests
{
    [Fact]
    public async Task Aborted_request_returns_499_without_enabling_status_code_pages() {
        using var canceled = new CancellationTokenSource();
        canceled.Cancel();
        var context = CreateContext(canceled.Token);
        var pages = new TestStatusCodePagesFeature();
        context.Features.Set<IStatusCodePagesFeature>(pages);
        var middleware = new ClientCancellationMiddleware(_ => Task.FromException(new OperationCanceledException(canceled.Token)));

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status499ClientClosedRequest, context.Response.StatusCode);
        Assert.False(pages.Enabled);
        Assert.Equal(0, context.Response.Body.Length);
    }

    [Fact]
    public async Task Aborted_request_without_status_code_pages_feature_still_returns_499() {
        using var canceled = new CancellationTokenSource();
        canceled.Cancel();
        var context = CreateContext(canceled.Token);
        var middleware = new ClientCancellationMiddleware(_ => Task.FromException(new TaskCanceledException()));

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status499ClientClosedRequest, context.Response.StatusCode);
    }

    [Fact]
    public async Task Non_client_cancellation_is_not_hidden_even_when_an_operation_token_is_canceled() {
        using var request = new CancellationTokenSource();
        using var operation = new CancellationTokenSource();
        operation.Cancel();
        var context = CreateContext(request.Token);
        var exception = new OperationCanceledException(operation.Token);
        var middleware = new ClientCancellationMiddleware(_ => Task.FromException(exception));

        var thrown = await Assert.ThrowsAsync<OperationCanceledException>(() => middleware.InvokeAsync(context));

        Assert.Same(exception, thrown);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }

    [Fact]
    public async Task Non_cancellation_failure_is_not_hidden_when_client_has_disconnected() {
        using var canceled = new CancellationTokenSource();
        canceled.Cancel();
        var context = CreateContext(canceled.Token);
        var exception = new InvalidOperationException("Unexpected application failure.");
        var middleware = new ClientCancellationMiddleware(_ => Task.FromException(exception));

        var thrown = await Assert.ThrowsAsync<InvalidOperationException>(() => middleware.InvokeAsync(context));

        Assert.Same(exception, thrown);
        Assert.Equal(StatusCodes.Status200OK, context.Response.StatusCode);
    }

    [Fact]
    public async Task Successful_request_preserves_response_and_status_code_pages() {
        var context = CreateContext(CancellationToken.None);
        var pages = new TestStatusCodePagesFeature();
        context.Features.Set<IStatusCodePagesFeature>(pages);
        var middleware = new ClientCancellationMiddleware(httpContext => {
            httpContext.Response.StatusCode = StatusCodes.Status204NoContent;
            return Task.CompletedTask;
        });

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status204NoContent, context.Response.StatusCode);
        Assert.True(pages.Enabled);
    }

    private static DefaultHttpContext CreateContext(CancellationToken requestAborted) {
        var context = new DefaultHttpContext { RequestAborted = requestAborted };
        context.Response.Body = new MemoryStream();
        return context;
    }

    private sealed class TestStatusCodePagesFeature : IStatusCodePagesFeature
    {
        public bool Enabled { get; set; } = true;
    }
}
