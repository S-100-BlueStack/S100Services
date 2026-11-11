using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;
using ProductCatalogueAPI.Services.ValidationEmail;
using Xunit;

namespace TestProductCatalogue;

/// <summary>Verifies checkpoint safety with controlled mailbox and persistence failures.</summary>
public sealed class ValidationEmailSyncTests
{
    /// <summary>A failed message insert or cursor commit repeats the page without losing durable evidence.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task FailureBeforeCheckpointReplaysSafely(bool failInsert) {
        var store = new Store { FailInsertOnce = failInsert, FailCursorOnce = !failInsert };
        var mailbox = new Mailbox();
        var sync = new ValidationMailboxSynchronizer(store, mailbox, TimeProvider.System, new IcEncReportParser());
        await Assert.ThrowsAsync<IOException>(() => sync.SynchronizeAsync(new(), default));
        Assert.Null(store.Cursor);
        await sync.SynchronizeAsync(new(), default);
        Assert.Equal("complete", store.Cursor);
        Assert.Single(store.Messages);
        Assert.Equal(2, mailbox.InitialBoundaries.Count);
        Assert.Equal(mailbox.InitialBoundaries[0], mailbox.InitialBoundaries[1]);
    }

    /// <summary>Expired tokens replay from the original initial boundary, including after a restart.</summary>
    [Fact]
    public async Task ExpiredDeltaRetainsInitialWindow() {
        var store = new Store { Cursor = "expired" };
        var mailbox = new Mailbox { Expired = true };
        var sync = new ValidationMailboxSynchronizer(store, mailbox, TimeProvider.System, new IcEncReportParser());
        Assert.False(await sync.SynchronizeAsync(new(), default));
        Assert.Null(store.Cursor);
        mailbox.Expired = false;
        await sync.SynchronizeAsync(new(), default);
        Assert.Equal(mailbox.InitialBoundaries[0], mailbox.InitialBoundaries[1]);
    }

    /// <summary>Cancellation does not advance the page cursor.</summary>
    [Fact]
    public async Task CancellationLeavesPagePending() {
        var store = new Store();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => new ValidationMailboxSynchronizer(store, new Mailbox(), TimeProvider.System, new IcEncReportParser()).SynchronizeAsync(new(), cancellation.Token));
        Assert.Null(store.Cursor);
        Assert.Empty(store.Messages);
    }

    /// <summary>A message removed during retrieval is durably visible for review, allowing the page to advance.</summary>
    [Fact]
    public async Task RemovedMessageDoesNotBlockMailboxForever() {
        var store = new Store();
        await new ValidationMailboxSynchronizer(store, new Mailbox { NotFound = true }, TimeProvider.System, new IcEncReportParser()).SynchronizeAsync(new(), default);
        Assert.Equal("MESSAGE_UNAVAILABLE", Assert.Single(store.Messages.Values).RetrievalProblem);
        Assert.Equal("complete", store.Cursor);
    }

    /// <summary>Intermediate pages commit only after their own messages are durable.</summary>
    [Fact]
    public async Task PaginationPreservesEachPage() {
        var store = new Store();
        await new ValidationMailboxSynchronizer(store, new Mailbox { Paginated = true }, TimeProvider.System, new IcEncReportParser()).SynchronizeAsync(new(), default);
        Assert.Equal(new[] { "next", "complete" }, store.Cursors);
        Assert.Equal(2, store.Messages.Count);
    }

    private sealed class Store : IValidationMailboxSyncStore
    {
        public string? Cursor { get; set; }
        public bool FailInsertOnce { get; set; }
        public bool FailCursorOnce { get; set; }
        public Dictionary<string, ValidationEmailMessage> Messages { get; } = new(StringComparer.Ordinal);
        public List<string?> Cursors { get; } = [];
        public Task<ValidationMailboxSyncState> GetSyncAsync(string key, int lookbackDays, CancellationToken cancellationToken) => Task.FromResult(new ValidationMailboxSyncState { InitialFromUtc = DateTimeOffset.Parse("2026-11-01T00:00:00Z"), Cursor = Cursor });
        public Task InsertAsync(string mailboxKey, ValidationEmailMessage message, CancellationToken cancellationToken) {
            if (FailInsertOnce) { FailInsertOnce = false; throw new IOException("Insert failed"); }
            Messages.TryAdd(message.Id, message);
            return Task.CompletedTask;
        }
        public Task SaveCursorAsync(string key, string? cursor, int delayMinutes, CancellationToken cancellationToken) {
            if (FailCursorOnce) { FailCursorOnce = false; throw new IOException("Cursor commit failed"); }
            Cursor = cursor;
            Cursors.Add(cursor);
            return Task.CompletedTask;
        }
    }
    private sealed class Mailbox : IValidationMailbox
    {
        public bool Expired { get; set; }
        public bool NotFound { get; init; }
        public bool Paginated { get; init; }
        public List<DateTimeOffset> InitialBoundaries { get; } = [];
        public Task<ValidationMailboxPage> ReadPageAsync(string? cursor, DateTimeOffset initialFrom, CancellationToken cancellationToken) {
            cancellationToken.ThrowIfCancellationRequested();
            InitialBoundaries.Add(initialFrom);
            if (Expired) throw new ValidationDeltaExpiredException();
            return Task.FromResult(Paginated && cursor is null ? new ValidationMailboxPage(["one"], "next", false) : new ValidationMailboxPage([Paginated ? "two" : "one"], "complete", true));
        }
        public Task<ValidationEmailMessage> ReadMessageAsync(string id, CancellationToken cancellationToken) {
            if (NotFound) throw new HttpRequestException("Removed", null, System.Net.HttpStatusCode.NotFound);
            return Task.FromResult(new ValidationEmailMessage(id, null, "fixture@example.invalid", DateTimeOffset.Parse("2026-11-09T00:00:00Z"), "CELL REGISTRATION - SUCCESSFUL - DK30549D.000", "", []));
        }
    }
}
