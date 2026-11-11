using ProductCatalogueAPI.Services.ValidationEmail.Providers.IcEnc;
using ProductCatalogueAPI.Services.ValidationEmail;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using Xunit;

namespace TestProductCatalogue;

/// <summary>Independent unit tests: no mailbox, SQL Server, ArcGIS, or project-wide initialization.</summary>
public sealed class ValidationEmailTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 9, 12, 0, 0, TimeSpan.Zero);
    private static readonly IcEncReportParser Parser = new();

    /// <summary>The eight observed templates include holding language, absent subject CRC and a registration discrepancy.</summary>
    [Theory]
    [InlineData(0, ValidationEmailOutcome.Registered, 9, "9268B827")]
    [InlineData(1, ValidationEmailOutcome.Rejected, 6, "40DB80AE")]
    [InlineData(2, ValidationEmailOutcome.Rejected, 6, "20D454EC")]
    [InlineData(3, ValidationEmailOutcome.Rejected, 3, "9591ADBA")]
    [InlineData(4, ValidationEmailOutcome.Rejected, 4, "7ED6CCD6")]
    [InlineData(5, ValidationEmailOutcome.PendingConditions, 1, "A7B50E90")]
    [InlineData(6, ValidationEmailOutcome.Accepted, 3, "C0571EC1")]
    [InlineData(7, ValidationEmailOutcome.PendingConditions, 2, "12560A72")]
    public void ObservedTemplates(int index, ValidationEmailOutcome expected, int edition, string crc) {
        var message = Sample(index);
        var parsed = Parser.Parse(message);
        Assert.Equal(expected, parsed.Outcome);
        Assert.Equal(edition, parsed.Edition);
        Assert.Equal(crc, parsed.Crc);
        Assert.True(parsed.CanMatch, string.Join(',', parsed.Diagnostics));
        if (index == 0) Assert.Contains("REGISTRATION_ATTACHMENT_ERROR", parsed.Diagnostics);
        if (index == 6) Assert.Equal(new DateOnly(2026, 3, 12), parsed.ExpectedReleaseDate);
    }

    /// <summary>Unknown or contradictory evidence cannot finalize a candidate.</summary>
    [Theory]
    [InlineData("subject-crc", "CRC_SOURCE_CONFLICT")]
    [InlineData("report-cell", "REPORT_DATASET_MISMATCH")]
    [InlineData("holding", "SUBJECT_REPORT_CONFLICT")]
    [InlineData("missing", "REQUIRES_ONE_P007_REPORT")]
    [InlineData("malformed", "MALFORMED_OR_UNSUPPORTED_ATTACHMENT")]
    [InlineData("multiple", "MULTIPLE_DATASETS")]
    [InlineData("incomplete", "INCOMPLETE_RETRIEVAL")]
    [InlineData("conditional-unknown", "SUBJECT_REPORT_CONFLICT")]
    public void UnsafeEvidenceRequiresReview(string mutation, string diagnostic) {
        var message = Sample(6);
        message = mutation switch {
            "subject-crc" => message with { Subject = message.Subject.Replace("C0571EC1", "AAAAAAAA") },
            "report-cell" => ChangeReport(message, t => t.Replace("Cell Name - DK5OTERP.000", "Cell Name - DK30557D.001")),
            "holding" => ChangeReport(message, t => t.Replace("ACCEPTED FOR DISTRIBUTION ON 12 Mar 2026", "ACCEPTED FOR DISTRIBUTION pending confirmation")),
            "conditional-unknown" => ChangeReport(message, t => t.Replace("ACCEPTED FOR DISTRIBUTION ON 12 Mar 2026", "ACCEPTED FOR DISTRIBUTION subject to further approval")),
            "missing" => message with { Attachments = [] },
            "malformed" => message with { Attachments = [new(message.Attachments[0].Name, [1, 2, 3])] },
            "multiple" => message with { Body = "Also DK30557D.001" },
            "incomplete" => message with { RetrievalProblem = "Download failed" },
            _ => throw new ArgumentException(mutation)
        };
        var parsed = Parser.Parse(message);
        Assert.False(parsed.CanMatch);
        Assert.Contains(diagnostic, parsed.Diagnostics);
    }

    /// <summary>The absence of CRC is explicit and does not turn the update suffix into an edition.</summary>
    [Fact]
    public void MissingCrcEverywhere() {
        var message = ChangeReport(Sample(6) with { Subject = Sample(6).Subject.Split(" - CRC:")[0] }, t => t.Replace("CRC - C0571EC1", ""));
        var parsed = Parser.Parse(message);
        Assert.True(parsed.CanMatch);
        Assert.Null(parsed.Crc);
        Assert.Equal(3, parsed.Edition);
        Assert.Equal(0, parsed.Update);
    }

    /// <summary>Retains the useful old reader's exported-subject normalization while cross-checking report identity.</summary>
    [Fact]
    public void LegacySubjectSeparatorsRemainSupported() {
        var message = Sample(6) with { Subject = "  " + Sample(6).Subject.Replace("DK5OTERP.000", "dk5oterp_000").Replace("CRC: ", "CRC_").Replace(" - ", " – ") + "  " };
        var parsed = Parser.Parse(message);
        Assert.True(IcEncReportParser.IsRelevantSubject(message.Subject));
        Assert.True(parsed.CanMatch, string.Join(',', parsed.Diagnostics));
        Assert.Equal("DK5OTERP.000", parsed.FileName);
        Assert.Equal(ValidationEmailOutcome.Accepted, parsed.Outcome);
    }

    /// <summary>Quoted history and disclaimers cannot override current evidence.</summary>
    [Fact]
    public void QuotedHistoryIgnored() {
        var message = Sample(6) with { Body = "Current notice.\nFrom: earlier sender\nDK30557D.001 NOT ACCEPTED FOR DISTRIBUTION" };
        Assert.True(Parser.Parse(message).CanMatch);
        Assert.True(Parser.Parse(message with { Body = "<p>Current notice.</p><blockquote>DK30557D.001</blockquote>" }).CanMatch);
    }

    /// <summary>Known S-101 filename conventions do not need a guessed S-57 to S-101 conversion.</summary>
    [Fact]
    public void S101Identity() {
        var message = ChangeReport(Sample(6), t => t.Replace("DK5OTERP", "101DK005OTERP"));
        message = message with { Subject = message.Subject.Replace("DK5OTERP", "101DK005OTERP"), Attachments = [new("P007_101DK005OTERP_000.DOC", message.Attachments[0].Content)] };
        var parsed = Parser.Parse(message);
        Assert.True(parsed.CanMatch);
        Assert.Equal("S101", parsed.Specification);
    }

    /// <summary>CRC mismatch, duplicate historical transmissions and future attempts cannot be guessed away.</summary>
    [Theory]
    [InlineData("unknown", "NO_VERIFIED_TRANSMISSION")]
    [InlineData("crc", "NO_VERIFIED_TRANSMISSION")]
    [InlineData("duplicate", "AMBIGUOUS_TRANSMISSION")]
    [InlineData("future", "NO_VERIFIED_TRANSMISSION")]
    [InlineData("uncertain", "DELIVERY_REQUIRES_RECONCILIATION")]
    [InlineData("sender", "SENDER_REQUIRES_REVIEW")]
    public void UnsafeMatches(string scenario, string reason) {
        var message = Sample(6);
        var parsed = Parser.Parse(message);
        var file = Outgoing(parsed);
        IReadOnlyList<ValidationOutgoingFile> outgoing = scenario switch {
            "unknown" => [],
            "crc" => [file with { Crc = "00000000" }],
            "duplicate" => [file, file with { DeliveryId = Guid.NewGuid(), RevisionId = Guid.NewGuid() }],
            "future" => [file with { SentAtUtc = Now.AddDays(1).UtcDateTime }],
            "uncertain" => [file with { Status = "Uncertain" }],
            _ => [file]
        };
        if (scenario == "sender") message = message with { TrustedSender = false };
        Assert.Equal(reason, ValidationEmailMatcher.Match(message, parsed, outgoing).Reason);
    }

    /// <summary>A late old CRC matches the old attempt; it never selects the replacement.</summary>
    [Fact]
    public void LateNoticeKeepsOldRevisionIdentity() {
        var message = Sample(6);
        var parsed = Parser.Parse(message);
        var old = Outgoing(parsed);
        var newer = old with { DeliveryId = Guid.NewGuid(), RevisionId = Guid.NewGuid(), Crc = "12345678" };
        Assert.Equal(old.RevisionId, ValidationEmailMatcher.Match(message, parsed, [old, newer]).File?.RevisionId);
    }

    /// <summary>Historical attempts with no file evidence prevent guessing a newer exact-CRC match.</summary>
    [Fact]
    public void LegacyAttemptsBlockAutomaticMatching() {
        var message = Sample(6);
        var parsed = Parser.Parse(message);
        var file = Outgoing(parsed);
        var legacy = file with { DeliveryId = Guid.NewGuid(), HasManifest = false, Crc = null };
        Assert.Null(ValidationEmailMatcher.Match(message, parsed, [file, legacy]).File);
        Assert.Equal(file.DeliveryId, ValidationEmailMatcher.Match(message, parsed, [file, legacy], file.DeliveryId).File?.DeliveryId);
        Assert.Null(ValidationEmailMatcher.Match(message, parsed, [file with { SentAtUtc = Now.AddMinutes(-1).UtcDateTime }]).File);
    }

    /// <summary>Conflicting final outcomes and later holding notices cannot regress a finalized decision.</summary>
    [Theory]
    [InlineData(1, "Accepted")]
    [InlineData(6, "Rejected")]
    [InlineData(5, "Accepted")]
    public async Task OutOfOrderOutcomesRequireReview(int sample, string existingStatus) {
        var message = Sample(sample);
        var store = new Store([Outgoing(Parser.Parse(message)) with { Status = existingStatus }]);
        var sink = new Sink();
        var result = await new ValidationEmailProcessor(Parser, store, sink).ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), null, default);
        Assert.Equal("Review", result.Status);
        Assert.Equal("CONFLICTS_WITH_FINAL_DECISION", result.Reason);
        Assert.Empty(sink.Applied);
    }

    /// <summary>Non-final notices, unauthenticated senders, rollout barriers and dry runs never call acceptance.</summary>
    [Theory]
    [InlineData(0, false, true, true, "Review")]
    [InlineData(5, false, true, true, "Review")]
    [InlineData(6, true, true, true, "DryRun")]
    [InlineData(6, false, false, true, "Review")]
    [InlineData(6, false, true, false, "Review")]
    public async Task NonFinalOrUnsafeWorkDoesNotApply(int index, bool dryRun, bool trusted, bool pastBarrier, string expectedStatus) {
        var message = Sample(index) with { TrustedSender = trusted };
        var store = new Store([Outgoing(Parser.Parse(message))]);
        var sink = new Sink();
        var result = await new ValidationEmailProcessor(Parser, store, sink).ProcessAsync(Guid.NewGuid(), message, dryRun, pastBarrier ? Now.AddDays(-1) : Now.AddDays(1), null, default);
        Assert.Equal(expectedStatus, result.Status);
        Assert.Empty(sink.Applied);
    }

    /// <summary>Original evidence is committed before the shared acknowledgement boundary is invoked.</summary>
    [Fact]
    public async Task EvidenceFailurePreventsAcceptance() {
        var message = Sample(6);
        var store = new Store([Outgoing(Parser.Parse(message))]) { FailSave = 1 };
        var sink = new Sink();
        await Assert.ThrowsAsync<IOException>(() => new ValidationEmailProcessor(Parser, store, sink).ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), null, default));
        Assert.Empty(sink.Applied);
    }

    /// <summary>Retry after the decision commits reuses the exact same event ID and cannot apply twice.</summary>
    [Fact]
    public async Task RestartAfterDecisionIsIdempotent() {
        var message = Sample(6);
        var store = new Store([Outgoing(Parser.Parse(message))]) { FailSave = 2 };
        var sink = new Sink();
        var processor = new ValidationEmailProcessor(Parser, store, sink);
        var id = Guid.NewGuid();
        await Assert.ThrowsAsync<IOException>(() => processor.ProcessAsync(id, message, false, Now.AddDays(-1), null, default));
        Assert.Equal("Applied", (await processor.ProcessAsync(id, message, false, Now.AddDays(-1), null, default)).Status);
        Assert.Single(sink.Applied);
    }

    /// <summary>Infrastructure failures leave retry to the durable queue; stale or conflicting decisions become review.</summary>
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task DecisionFailureDoesNotClaimSuccess(bool throws) {
        var message = Sample(6);
        var store = new Store([Outgoing(Parser.Parse(message))]);
        var sink = new Sink { Throw = throws, Accept = false };
        var processor = new ValidationEmailProcessor(Parser, store, sink);
        if (throws) await Assert.ThrowsAsync<IOException>(() => processor.ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), null, default));
        else Assert.Equal("Review", (await processor.ProcessAsync(Guid.NewGuid(), message, false, Now.AddDays(-1), null, default)).Status);
    }

    /// <summary>Each notice passes only its own candidate to the existing pair-aware business service.</summary>
    [Fact]
    public async Task MixedOutcomesStayIndependent() {
        var accepted = ChangeReport(Sample(6) with { Subject = Sample(6).Subject.Split(" - CRC:")[0].Replace("DK5OTERP", "101DK005OTERP") },
            text => text.Replace("DK5OTERP", "101DK005OTERP").Replace("CRC - C0571EC1", ""));
        accepted = accepted with { Attachments = [new("P007_101DK005OTERP_000.DOC", accepted.Attachments[0].Content)] };
        var rejected = Sample(1);
        Assert.Equal("S101", Parser.Parse(accepted).Specification);
        Assert.Equal("S57", Parser.Parse(rejected).Specification);
        var store = new Store([Outgoing(Parser.Parse(accepted)), Outgoing(Parser.Parse(rejected))]);
        var sink = new Sink();
        var processor = new ValidationEmailProcessor(Parser, store, sink);
        await processor.ProcessAsync(Guid.NewGuid(), accepted, false, Now.AddDays(-1), null, default);
        await processor.ProcessAsync(Guid.NewGuid(), rejected, false, Now.AddDays(-1), null, default);
        Assert.Equal(2, sink.Applied.Count);
        Assert.Contains(sink.Applied.Values, v => v.Outcome == ValidationEmailOutcome.Accepted);
        Assert.Contains(sink.Applied.Values, v => v.Outcome == ValidationEmailOutcome.Rejected);
        Assert.Equal(2, sink.Applied.Values.Select(v => v.RevisionId).Distinct().Count());
    }

    /// <summary>Operator review resolves a transmission ambiguity, but cannot override invalid evidence or dry-run.</summary>
    [Fact]
    public async Task ManualAssociationKeepsSafetyChecks() {
        var message = Sample(6) with { TrustedSender = false };
        var parsed = Parser.Parse(message);
        var file = Outgoing(parsed);
        var store = new Store([file, file with { DeliveryId = Guid.NewGuid() }]);
        var sink = new Sink();
        var processor = new ValidationEmailProcessor(Parser, store, sink);
        var review = new ValidationEmailReview(file.DeliveryId, "Verified exact transmission in IC-ENC records.");
        Assert.Equal("Applied", (await processor.ProcessAsync(Guid.NewGuid(), message, false, null, review, default)).Status);
        Assert.Equal("DryRun", (await processor.ProcessAsync(Guid.NewGuid(), message, true, null, review, default)).Status);
        Assert.Single(sink.Applied);
        Assert.Equal("Review", (await processor.ProcessAsync(Guid.NewGuid(), message with { Attachments = [] }, false, null, review, default)).Status);
    }

    /// <summary>CRC follows the IHO reference algorithm and includes the standard known-answer vector.</summary>
    [Fact]
    public void ActualManifestAndUpdateBundle() {
        var zip = Zip(("ENC_ROOT/DK5OTERP.000", "123456789"));
        Assert.Equal("CBF43926", ValidationOutgoingManifest.Read(zip, "S57", "DK5OTERP", 0).Single().Crc);
        var update = Zip(("S100_ROOT/101DK005OTERP.000", "base"), ("S100_ROOT/101DK005OTERP.001", "update"));
        var file = Assert.Single(ValidationOutgoingManifest.Read(update, "S101", "101DK005OTERP", 1), file => file.FileName.EndsWith(".001", StringComparison.Ordinal));
        Assert.Equal("101DK005OTERP.001", file.FileName);
        Assert.Null(file.Crc);
        Assert.Throws<InvalidDataException>(() => ValidationOutgoingManifest.Read(zip, "S57", "DK30557D", 0));
    }

    /// <summary>Untrusted display names and live configuration without a rollout barrier fail closed.</summary>
    [Fact]
    public void ConfigurationAndSenderValidation() {
        Assert.True(new ValidationEmailOptions().IsValid());
        Assert.False(new ValidationEmailOptions { Mode = ValidationEmailMode.Live, DryRun = false }.IsValid());
        Assert.False(ValidationEmailOptions.IsSmtpAddress("IC-ENC <attacker@example.invalid>"));
        Assert.False(ValidationEmailOptions.IsSmtpAddress("invalid"));
        Assert.True(ValidationEmailOptions.IsSmtpAddress("fixture@example.invalid"));
    }

    /// <summary>Protected marker absence, duplicates, forwarding and lookalike addresses require review.</summary>
    [Theory]
    [InlineData("fixture@example.invalid", "fixture@example.invalid", 1, true)]
    [InlineData("fixture@example.invalid", "fixture@example.invalid", 0, false)]
    [InlineData("fixture@example.invalid", "fixture@example.invalid", 2, false)]
    [InlineData("fixture@example.invalid", "forwarder@example.invalid", 1, false)]
    [InlineData("fixture@example.invalid.attacker.test", "fixture@example.invalid.attacker.test", 1, false)]
    [InlineData("IC-ENC <fixture@example.invalid>", "fixture@example.invalid", 1, false)]
    public void SenderTrustRequiresProtectedTransport(string from, string sender, int markers, bool expected) {
        var options = new ValidationEmailOptions { AllowedSenders = ["fixture@example.invalid"], TrustedHeaderValue = "verified" };
        var headers = Enumerable.Range(0, markers).Select(_ => new KeyValuePair<string, string>(options.TrustedHeaderName, "verified")).ToArray();
        Assert.Equal(expected, ValidationEmailSenderTrust.IsTrusted(from, sender, headers, options));
    }

    private static ValidationEmailMessage Sample(int index) {
        var directory = Path.Combine(AppContext.BaseDirectory, "IcEncEmailFixtures");
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, "scenarios.json")));
        var item = json.RootElement[index];
        var name = item.GetProperty("Attachment").GetString()!;
        return new("sample-" + index, "<sample@example.invalid>", "fixture@example.invalid", Now, item.GetProperty("Subject").GetString()!, "", [new(name, File.ReadAllBytes(Path.Combine(directory, name)))], true);
    }
    private static ValidationEmailMessage ChangeReport(ValidationEmailMessage message, Func<string, string> transform) {
        using var memory = new MemoryStream(message.Attachments[0].Content);
        using var zip = new ZipArchive(memory);
        using var reader = new StreamReader(zip.GetEntry("word/document.xml")!.Open());
        return message with { Attachments = [new(message.Attachments[0].Name, Zip(("word/document.xml", transform(reader.ReadToEnd()))))] };
    }
    private static byte[] Zip(params (string Name, string Text)[] files) {
        using var memory = new MemoryStream();
        using (var zip = new ZipArchive(memory, ZipArchiveMode.Create, true))
            foreach (var file in files) { using var writer = new StreamWriter(zip.CreateEntry(file.Name).Open(), new UTF8Encoding(false)); writer.Write(file.Text); }
        return memory.ToArray();
    }
    private static ValidationOutgoingFile Outgoing(ValidationEmailParseResult parsed) => new(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), parsed.FileName![..^4], parsed.Specification!, parsed.Edition ?? 1, parsed.Update!.Value, parsed.FileName, parsed.Crc, parsed.DateReceived?.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) ?? Now.AddHours(-1).UtcDateTime, "Delivered");
    private sealed class Store(IReadOnlyList<ValidationOutgoingFile> outgoing) : IValidationEmailStore
    {
        public int FailSave { get; init; }
        private int saves;
        public Task<IReadOnlyList<ValidationOutgoingFile>> FindOutgoingAsync(string fileName, CancellationToken cancellationToken) => Task.FromResult(outgoing);
        public Task SaveResultAsync(Guid id, ValidationEmailProcessingResult result, IReadOnlyList<ValidationEmailAttachment> attachments, CancellationToken cancellationToken) {
            if (++saves == FailSave) throw new IOException("Simulated SQL/artifact failure");
            return Task.CompletedTask;
        }
    }
    private sealed class Sink : IValidationEmailDecisionSink
    {
        public Dictionary<Guid, (Guid RevisionId, ValidationEmailOutcome Outcome)> Applied { get; } = [];
        public bool Throw { get; init; }
        public bool Accept { get; init; } = true;
        public Task<bool> ApplyAsync(Guid id, ValidationOutgoingFile file, ValidationEmailParseResult parsed, CancellationToken cancellationToken) {
            if (Throw) throw new IOException("Simulated acknowledgement failure");
            if (Accept) Applied.TryAdd(id, (file.RevisionId, parsed.Outcome));
            return Task.FromResult(Accept);
        }
    }
}
