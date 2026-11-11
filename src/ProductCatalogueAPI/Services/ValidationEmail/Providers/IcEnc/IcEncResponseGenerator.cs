using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Xml.Linq;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;

/// <summary>Builds the four outcome classes using the eight observed sample variants and real candidate identity.</summary>
public sealed class IcEncResponseGenerator(IValidationEmailSimulationRandom random) : IValidationResponseGenerator
{
    /// <summary>Generates one synthetic notice and OOXML/XML attachment; never calls a mailbox or workflow service.</summary>
    /// <param name="candidate">Exact immutable candidate including its stored exchange set.</param>
    /// <param name="sourceKey">Stable send-job or explicit simulation request key.</param>
    /// <param name="now">Fixed generation instant supplied by the coordinator.</param>
    /// <returns>A permanently marked synthetic message for the normal parser and matcher.</returns>
    public ValidationEmailMessage Generate(ValidationSimulationCandidate candidate, string sourceKey, DateTimeOffset now) {
        if (candidate.Edition < 0 || candidate.Update is < 0 or > 999 || string.IsNullOrWhiteSpace(sourceKey) || sourceKey.Length > 256)
            throw new ArgumentException("Simulation requires an exact bounded candidate and source key.");
        var files = ValidationOutgoingManifest.Read(candidate.ExchangeSet, candidate.Specification, candidate.DatasetName, candidate.Update);
        var file = files.Single(f => f.FileName.Equals(candidate.DatasetName + "." + candidate.Update.ToString("000", CultureInfo.InvariantCulture), StringComparison.OrdinalIgnoreCase));
        var outcome = new[] { ValidationEmailOutcome.Registered, ValidationEmailOutcome.Rejected, ValidationEmailOutcome.Accepted, ValidationEmailOutcome.PendingConditions }[random.Next(4)];
        var variant = outcome == ValidationEmailOutcome.Rejected ? random.Next(4) : outcome == ValidationEmailOutcome.PendingConditions ? random.Next(2) : 0;
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sourceKey)));
        var deliveryId = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes("simulation-delivery:" + sourceKey))[..16]);
        var outgoing = new ValidationOutgoingFile(deliveryId, candidate.RevisionId, candidate.TrackId, candidate.DatasetName, candidate.Specification,
            candidate.Edition, candidate.Update, file.FileName, file.Crc, now.AddSeconds(-1).UtcDateTime, "Delivered");
        // The supplied holding subjects and one rejection omit CRC even though the P007 report contains it.
        var crc = file.Crc is null || outcome == ValidationEmailOutcome.PendingConditions || outcome == ValidationEmailOutcome.Rejected && variant == 2 ? "" : " - CRC: " + file.Crc;
        var suffix = outcome switch {
            ValidationEmailOutcome.Rejected => "NOT ACCEPTED FOR DISTRIBUTION",
            ValidationEmailOutcome.Accepted => "ACCEPTED FOR DISTRIBUTION",
            ValidationEmailOutcome.PendingConditions => "PASSED IN HOLDING",
            _ => "SUCCESSFUL"
        };
        var subject = outcome == ValidationEmailOutcome.Registered ? $"CELL REGISTRATION - SUCCESSFUL - {file.FileName}{crc}" : $"VALIDATION OF CELL - {file.FileName} - {suffix}{crc}";
        var body = "SIMULATION: generated IC-ENC response. No email was received and no dataset decision will be applied.";
        ValidationEmailAttachment attachment;
        if (outcome == ValidationEmailOutcome.Registered) {
            var cell = new XElement("Cell", new XAttribute("Name", file.FileName.Replace('.', '_')), new XAttribute("ProductType", candidate.Specification),
                file.Crc is null ? null : new XAttribute("CRC", file.Crc), new XElement("Message", new XAttribute("Category", "Comment"), $"Processing Edition {candidate.Edition}, Update {candidate.Update}"),
                new XElement("Message", new XAttribute("Category", "Error"), "SIMULATION: referenced ancillary file is missing, mirroring the supplied registration discrepancy."));
            var xml = new XDocument(new XElement("Log", new XAttribute("Simulation", "true"), cell));
            attachment = new("DMDLOAD_" + file.FileName.Replace('.', '_') + ".XML", Encoding.UTF8.GetBytes(xml.ToString()));
        }
        else {
            var conclusion = outcome switch {
                ValidationEmailOutcome.Rejected => "NOT ACCEPTED FOR DISTRIBUTION due to data issues requiring correction before release.",
                ValidationEmailOutcome.PendingConditions => "ACCEPTED FOR DISTRIBUTION pending confirmation from you on the following matters:\nThat the SECTR1 and SECTR2 values are correctly encoded.",
                _ => "ACCEPTED FOR DISTRIBUTION ON " + now.AddDays(7).ToString("dd MMM yyyy", CultureInfo.InvariantCulture)
            };
            var comments = outcome == ValidationEmailOutcome.Rejected ? new[] {
                "Record count mismatch. Action: resubmit the cell as a new edition to reset header information.",
                "Overlapping Group 1 coverage. Action: review edges to achieve non-overlapping coverage.",
                "Incorrect sounding value. Action: check source data and correct the sounding or its enclosing area.",
                "Update unable to apply because of mismatched FOIDs. Action: create a new edition and resubmit."
            }[variant] : outcome == ValidationEmailOutcome.PendingConditions ? new[] {
                "Action: review SECTR1/SECTR2 and remove inappropriate ORIENT attribution before release.",
                "Action: confirm light-sector encoding and associated navigation line before release."
            }[variant] : "This new edition contains no issues that require action.";
            var text = $"SIMULATION - not an IC-ENC decision\nENC Validation Report\nCell Name - {file.FileName}\nEdition Number - {candidate.Edition}\n" +
                (file.Crc is null ? "" : $"CRC - {file.Crc}\n") + $"Date Received - {now.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)}\nDate Validated - {now.ToString("dd MMM yyyy", CultureInfo.InvariantCulture)}\nValidation Conclusion\n{conclusion}\nValidation Comments\nSIMULATION: {comments}";
            attachment = new("P007_" + file.FileName.Replace('.', '_') + ".DOC", CreateReport(text));
            if (outcome == ValidationEmailOutcome.PendingConditions) body += " The cell is accepted for distribution and will be released when the conditions within the validation report have been met.";
        }
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

