using System.Text.RegularExpressions;
using DataCatalague.Api.Models.V1;
using Microsoft.Extensions.Caching.Memory;

namespace DataCatalague.Api.Services;

/// <summary>Best-effort, bounded directory enrichment independent of mutation and history reads.</summary>
public sealed partial class ActorProfileService(IActorProfileDirectory directory, ILogger<ActorProfileService> logger) : IDisposable
{
    private readonly object _sync = new();
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 256 });
    private readonly Dictionary<string, Task<ActorProfileResponse?>> _pending = new(StringComparer.OrdinalIgnoreCase);
    private bool _disposed;
    private const int MaximumConcurrentLookups = 4;

    // The recorded identity must be a qualified Windows account. System and
    // unqualified legacy accounts are deliberately not resolved by guessing a domain.
    [GeneratedRegex(@"\A[A-Za-z0-9][A-Za-z0-9._-]{0,63}\\[A-Za-z0-9][A-Za-z0-9._-]{0,127}\z", RegexOptions.CultureInvariant)]
    private static partial Regex AccountPattern();

    public static bool IsDirectoryAccount(string? actor) => actor is not null && AccountPattern().IsMatch(actor);

    public async Task<ActorProfileResponse?> GetAsync(string? actor, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        if (!IsDirectoryAccount(actor)) { return null; }
        var key = actor!.ToUpperInvariant();
        Task<ActorProfileResponse?> lookup;
        lock (this._sync) {
            if (this._disposed) { return null; }
            if (this._cache.TryGetValue<ActorProfileResponse?>(key, out var cached)) { return cached is null ? null : cached with { Actor = actor! }; }
            if (!this._pending.TryGetValue(key, out lookup!)) {
                // No unbounded work queue during AD outages. Keep the slot until
                // the synchronous OS call actually exits, even if a reader times out.
                if (this._pending.Count >= MaximumConcurrentLookups) { return null; }
                // The worker must not inherit a request identity or retain HttpContext.
                // LDAP uses the API execution identity, never the history reader.
                if (ExecutionContext.IsFlowSuppressed()) { lookup = Task.Run(() => this.Resolve(key, actor!)); }
                else {
                    using var flow = ExecutionContext.SuppressFlow();
                    lookup = Task.Run(() => this.Resolve(key, actor!));
                }
                this._pending.Add(key, lookup);
            }
        }
        try {
            var result = await lookup.WaitAsync(TimeSpan.FromSeconds(5), cancellationToken);
            return result is null ? null : result with { Actor = actor! };
        }
        catch (TimeoutException) { return null; }
    }

    private ActorProfileResponse? Resolve(string key, string actor) {
        ActorProfileResponse? profile = null;
        try { profile = directory.Find(actor); }
        catch (Exception exception) {
            // Directory availability is not a history failure. Avoid logging
            // directory payloads, account names or raw LDAP exception messages.
            logger.LogWarning("Actor profile lookup failed ({ExceptionType}).", exception.GetType().Name);
        }
        lock (this._sync) {
            this._pending.Remove(key);
            if (!this._disposed) {
                this._cache.Set(key, profile, new MemoryCacheEntryOptions {
                    Size = 1,
                    AbsoluteExpirationRelativeToNow = profile is null ? TimeSpan.FromMinutes(2) : TimeSpan.FromMinutes(30),
                });
            }
        }
        return profile;
    }

    public void Dispose() {
        lock (this._sync) {
            if (this._disposed) { return; }
            this._disposed = true;
            this._cache.Dispose();
        }
    }
}
