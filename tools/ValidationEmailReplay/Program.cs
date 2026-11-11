using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;
using ProductCatalogueAPI.Services.ValidationEmail;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ValidationEmailReplay;

/// <summary>Offline parser/matcher replay. Has no database, network, acknowledgement or publication dependencies.</summary>
internal static class Program
{
    /// <summary>Reads normalized JSON messages and optionally an outgoing manifest JSON array.</summary>
    /// <param name="args">Input directory, optionally followed by an outgoing manifest JSON filename.</param>
    /// <returns>Zero when every message has safe parse evidence; two when one requires review.</returns>
    private static int Main(string[] args) {
        if (args.Length is < 1 or > 2) { Console.Error.WriteLine("Usage: ValidationEmailReplay <message-json-directory> [outgoing-manifest.json]"); return 1; }
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, WriteIndented = true };
        options.Converters.Add(new JsonStringEnumConverter());
        var outgoing = args.Length == 2 ? JsonSerializer.Deserialize<ValidationOutgoingFile[]>(ReadBounded(args[1]), options) ?? [] : [];
        var parser = new IcEncReportParser();
        var results = new List<object>();
        var requiresReview = false;
        foreach (var path in Directory.EnumerateFiles(args[0], "*.json").OrderBy(p => p, StringComparer.Ordinal)) {
            var message = JsonSerializer.Deserialize<ValidationEmailMessage>(ReadBounded(path), options) ?? throw new InvalidDataException("Invalid normalized message.");
            var parsed = parser.Parse(message with { TrustedSender = false });
            // Bypass sender trust solely to preview identity matching. This executable cannot call a decision sink.
            var match = ValidationEmailMatcher.Match(message with { TrustedSender = true }, parsed, outgoing);
            requiresReview |= !parsed.CanMatch;
            results.Add(new { Source = Path.GetFileName(path), message.Id, parsed.Outcome, parsed.FileName, parsed.Edition, parsed.Update, parsed.Crc,
                parsed.DateReceived, parsed.DateValidated, parsed.ExpectedReleaseDate, parsed.CanMatch, parsed.Diagnostics, MatchReason = match.Reason, match.File?.DeliveryId });
        }
        Console.WriteLine(JsonSerializer.Serialize(results, options));
        return requiresReview ? 2 : 0;
    }

    /// <summary>Bounds local input before allocating JSON text.</summary>
    private static string ReadBounded(string path) {
        if (new FileInfo(path).Length > 24 * 1024 * 1024) throw new InvalidDataException("Replay JSON exceeds 24 MiB.");
        return File.ReadAllText(path);
    }
}
