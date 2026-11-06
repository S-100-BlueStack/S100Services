using NanoidDotNet;
using System.Globalization;

namespace DataCatalague.Api.Services;

/// <summary>Reserves package identities for the lifetime of the application's in-memory event store.</summary>
public sealed class PackageIdentityService
{
    private const string Alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
    private readonly object _gate = new();
    private readonly HashSet<string> _shortIds = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _nextNumbers = new(StringComparer.Ordinal);

    /// <summary>Reserves a source short ID, or allocates a category/year sequence, together with a pipeline-style Nanoid.</summary>
    /// <param name="prefix">The existing category's identifier prefix.</param>
    /// <param name="sourceShortId">A validated published short ID, or null to allocate one.</param>
    /// <param name="utcNow">The UTC date used for generated short IDs.</param>
    /// <returns>The reserved identity, or null when the source short ID is already reserved.</returns>
    public (string Id, string ShortId)? Reserve(string prefix, string? sourceShortId, DateTimeOffset utcNow) {
        lock (this._gate) {
            var shortId = sourceShortId;
            if (shortId is null) {
                var year = utcNow.ToUniversalTime().ToString("yy", CultureInfo.InvariantCulture);
                var scope = $"{prefix}-{year}";
                this._nextNumbers.TryGetValue(scope, out var number);
                do {
                    shortId = $"{prefix}-{number.ToString("D3", CultureInfo.InvariantCulture)}-{year}";
                    number = checked(number + 1);
                } while (this._shortIds.Contains(shortId));
                this._nextNumbers[scope] = number;
            }
            var id = Nanoid.Generate(Alphabet, 18);
            if (!this._shortIds.Add(shortId)) { return null; }
            return (id, shortId);
        }
    }

    /// <summary>Releases a reservation when creation failed before any geometry committed.</summary>
    /// <param name="shortId">The reserved short ID.</param>
    public void Release(string shortId) {
        lock (this._gate) { this._shortIds.Remove(shortId); }
    }
}
