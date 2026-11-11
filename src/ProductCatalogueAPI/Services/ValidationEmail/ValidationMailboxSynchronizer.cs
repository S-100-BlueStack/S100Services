using System.Net;
using System.Security.Cryptography;
using System.Text;

namespace ProductCatalogueAPI.Services.ValidationEmail;

/// <summary>A bounded synchronization page. Its cursor is committed only after durable ingestion.</summary>
/// <param name="MessageIds">Immutable case-sensitive IDs; removals are ignored.</param>
/// <param name="Cursor">Opaque nextLink or deltaLink, validated before following.</param>
/// <param name="Complete">True only at the end of a delta round.</param>
public sealed record ValidationMailboxPage(string[] MessageIds, string Cursor, bool Complete);

/// <summary>Persisted cursor state; opaque Graph tokens must never be logged.</summary>
public sealed class ValidationMailboxSyncState
{
    /// <summary>Stable initial lookback retained across restart and expired delta tokens.</summary>
    public DateTimeOffset InitialFromUtc { get; set; }
    /// <summary>Next page or completed delta URL.</summary>
    public string? Cursor { get; set; }
    /// <summary>Earliest next poll time, persisted in UTC.</summary>
    public DateTime NextPollAtUtc { get; set; }
}

/// <summary>Read-only mailbox abstraction for Graph or an alternate hosting environment.</summary>
public interface IValidationMailbox
{
    /// <summary>Reads a bounded page from an initial date or an opaque durable cursor.</summary>
    Task<ValidationMailboxPage> ReadPageAsync(string? cursor, DateTimeOffset initialFrom, CancellationToken cancellationToken);
    /// <summary>Reads a message and reports without changing mailbox state.</summary>
    Task<ValidationEmailMessage> ReadMessageAsync(string id, CancellationToken cancellationToken);
}

/// <summary>Signals an expired delta token; resynchronization retains the original initial boundary.</summary>
public sealed class ValidationDeltaExpiredException : Exception;

/// <summary>Durability boundary for mailbox pages, independently testable without SQL Server.</summary>
public interface IValidationMailboxSyncStore
{
    /// <summary>Initializes the lookback once, before network requests.</summary>
    Task<ValidationMailboxSyncState> GetSyncAsync(string key, int lookbackDays, CancellationToken cancellationToken);
    /// <summary>Commits a cursor only after every relevant message on that page has been inserted.</summary>
    Task SaveCursorAsync(string key, string? cursor, int delayMinutes, CancellationToken cancellationToken);
    /// <summary>Durably inserts original evidence, deduplicating by case-sensitive transport ID.</summary>
    Task InsertAsync(string mailboxKey, ValidationEmailMessage message, CancellationToken cancellationToken);
}

/// <summary>Captures mailbox pages before moving their durable cursor; never applies candidate decisions.</summary>
public sealed class ValidationMailboxSynchronizer(IValidationMailboxSyncStore store, IValidationMailbox mailbox, TimeProvider clock, IValidationEmailParser parser)
{
    /// <summary>Reads at most twenty pages; the caller must hold the shared distributed processing lock.</summary>
    /// <param name="settings">Validated mailbox identity and polling policy.</param>
    /// <param name="cancellationToken">Cancellation leaves the current page eligible for replay.</param>
    /// <returns>False when an expired cursor was reset for resynchronization.</returns>
    public async Task<bool> SynchronizeAsync(ValidationEmailOptions settings, CancellationToken cancellationToken) {
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(settings.TenantId.ToUpperInvariant() + "\n" + settings.Mailbox.ToUpperInvariant() + "\n" + settings.Folder)));
        var state = await store.GetSyncAsync(key, settings.InitialLookbackDays, cancellationToken);
        if (state.NextPollAtUtc > clock.GetUtcNow().UtcDateTime) return true;
        for (var pageIndex = 0; pageIndex < 20; pageIndex++) {
            ValidationMailboxPage page;
            try { page = await mailbox.ReadPageAsync(state.Cursor, state.InitialFromUtc, cancellationToken); }
            catch (ValidationDeltaExpiredException) {
                await store.SaveCursorAsync(key, null, settings.PollIntervalMinutes, cancellationToken);
                return false;
            }
            foreach (var transportId in page.MessageIds) {
                ValidationEmailMessage message;
                try { message = await mailbox.ReadMessageAsync(transportId, cancellationToken); }
                catch (HttpRequestException exception) when (exception.StatusCode == HttpStatusCode.NotFound) {
                    message = new(transportId, null, "", clock.GetUtcNow(), "Unavailable mailbox message", "", [], false, "MESSAGE_UNAVAILABLE");
                }
                if (!parser.IsRelevantSubject(message.Subject) && message.RetrievalProblem is null) continue;
                await store.InsertAsync(key, message, cancellationToken);
            }
            // A crash before this commit repeats the page; immutable message deduplication makes that harmless.
            await store.SaveCursorAsync(key, page.Cursor, page.Complete ? settings.PollIntervalMinutes : 0, cancellationToken);
            state.Cursor = page.Cursor;
            if (page.Complete) break;
        }
        return true;
    }
}
