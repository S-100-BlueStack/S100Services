using System.Globalization;
using System.Security.Cryptography;
using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

/// <summary>Creates unconditional simulated acceptance reports using real candidate identity and outgoing checksums.</summary>
public sealed class IcEncResponseGenerator : IValidationResponseGenerator
{
    /// <summary>Retains the existing constructor contract; simulation no longer draws any random outcomes.</summary>
    /// <param name="random">Legacy injected dependency, retained for source compatibility and never consumed.</param>
    public IcEncResponseGenerator(IValidationEmailSimulationRandom random) => ArgumentNullException.ThrowIfNull(random);

    /// <summary>Generates one permanently synthetic unconditional acceptance notice, without accessing any mailbox or workflow.</summary>
    /// <param name="candidate">Exact immutable candidate including its stored exchange set.</param>
    /// <param name="sourceKey">Stable send-job or preview request key.</param>
    /// <param name="now">Fixed generation instant supplied by the coordinator.</param>
    /// <returns>An Accepted report for the normal parser, matcher and simulated acknowledgement path.</returns>
    public ValidationEmailMessage Generate(ValidationSimulationCandidate candidate, string sourceKey, DateTimeOffset now) {
        if (candidate.Edition < 0 || candidate.Update is < 0 or > 999 || string.IsNullOrWhiteSpace(sourceKey) || sourceKey.Length > 256)
            throw new ArgumentException("Simulation requires an exact bounded candidate and source key.");
        var files = ValidationOutgoingManifest.Read(candidate.ExchangeSet, candidate.Specification, candidate.DatasetName, candidate.Update);
        var file = files.Single(f => f.FileName.Equals(candidate.DatasetName + "." + candidate.Update.ToString("000", CultureInfo.InvariantCulture), StringComparison.OrdinalIgnoreCase));
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sourceKey)));
        var deliveryId = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes("simulation-delivery:" + sourceKey))[..16]);
        var outgoing = new ValidationOutgoingFile(deliveryId, candidate.RevisionId, candidate.TrackId, candidate.DatasetName, candidate.Specification,
            candidate.Edition, candidate.Update, file.FileName, file.Crc, now.AddSeconds(-1).UtcDateTime, "Delivered");
        var crc = file.Crc is null ? "" : " - CRC: " + file.Crc;
        var subject = $"VALIDATION OF CELL - {file.FileName} - ACCEPTED FOR DISTRIBUTION{crc}";
        var body = "SIMULATION: generated acceptance. No email was received from the external validation provider.";
        var text = $"SIMULATION - not an IC-ENC decision\nENC Validation Report\nCell Name - {file.FileName}\nEdition Number - {candidate.Edition}\n" +
            (file.Crc is null ? "" : $"CRC - {file.Crc}\n") + $"Date Received - {now.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)}\nDate Validated - {now.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)}\nValidation Conclusion\n" +
            "ACCEPTED FOR DISTRIBUTION ON " + now.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) +
            "\nValidation Comments\nSIMULATION: This new edition contains no issues that require action.";
        var attachment = new ValidationEmailAttachment("P007_" + file.FileName.Replace('.', '_') + ".DOC", CreateReport(text));
        return new(ValidationSimulationIdentity.MessageId(sourceKey), "<simulation-" + key + "@example.invalid>", "simulation@example.invalid", now, subject, body, [attachment], false, null, true, outgoing);
    }

    private static byte[] CreateReport(string text) {
        XNamespace word = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var document = new XDocument(new XElement(word + "document", new XElement(word + "body", text.Split('\n').Select(line => new XElement(word + "p", new XElement(word + "r", new XElement(word + "t", line)))))));
        using var memory = new MemoryStream();
        using (var zip = new ZipArchive(memory, ZipArchiveMode.Create, true)) {
            using (var writer = new StreamWriter(zip.CreateEntry("word/document.xml").Open(), new UTF8Encoding(false))) writer.Write(document.ToString());
            using (var writer = new StreamWriter(zip.CreateEntry("[Content_Types].xml").Open(), new UTF8Encoding(false)))
                writer.Write("<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>");
            using (var writer = new StreamWriter(zip.CreateEntry("_rels/.rels").Open(), new UTF8Encoding(false)))
                writer.Write("<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>");
        }
        return memory.ToArray();
    }
}

