using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Services.ValidationEmail;
using ProductCatalogueAPI.Data.Models;

namespace TestProductCatalogueAPI;

[Trait("Category", "Sql")]
public sealed class ProductIcEncDeliveryHistorySqlTests
{
    [DpcSqlFact]
    public async Task ReassociationKeepsStoredOwnerAndNeverChangesEitherDecision()
    {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var laterRevision = await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition,
            1, 0, "dataset", null, null, DpcRunFixture.Utc(10)));
        var predecessor = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        var a = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Rejected");
        var b = await db.InsertDeliveryAsync(seed.S101Track, laterRevision, "Accepted");
        var sibling = await db.InsertDeliveryAsync(seed.S57Track, seed.S57Revision, "Delivered");
        await db.ExecuteAsync("""
            UPDATE dbo.ProductExportTrack SET state = 1, candidate_edition = NULL, candidate_update = NULL,
                candidate_previous_state = NULL WHERE product_export_track_id = @Track;
            """, new { Track = seed.S101Track });

        var inbound = await ReceiptAsync(db, a, seed.S101Revision, """{"IsSimulation":false}""");
        var laterInbound = await ReceiptAsync(db, a, seed.S101Revision, """{"IsSimulation":false}""");
        await db.ExecuteAsync("""
            UPDATE dbo.ProductIcEncDelivery SET acknowledged_at_utc = @At, acknowledgement_source = 'Email',
                source_event_id = @Origin, rejection_reason = 'private fixture' WHERE delivery_id = @A;
            UPDATE dbo.ProductIcEncDelivery SET acknowledgement_source = 'Manual' WHERE delivery_id = @B;
            """, new { A = a, B = b, At = DpcRunFixture.Utc(11), Origin = inbound.ToString("D") });
        var report = await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(a, inbound));
        var additional = await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(a, laterInbound));
        var siblingInbound = await ReceiptAsync(db, sibling, seed.S57Revision, """{"IsSimulation":false}""");
        var siblingReport = await ArtifactAsync(db, seed.S57Track, seed.S57Revision, Metadata(sibling, siblingInbound));
        var manualInbound = await ReceiptAsync(db, b, laterRevision, """{"IsSimulation":false}""");
        await ArtifactAsync(db, seed.S101Track, laterRevision, Metadata(b, manualInbound));
        await ArtifactAsync(db, seed.S101Track, laterRevision, Metadata(a, inbound));

        var before = await HistoryAsync(db);
        Assert.Equal(3, before.Items.Count);
        Assert.Equal("NotDelivered", before.Items.Single(item => item.DeliveryId == predecessor).TransportStatus);
        var original = before.Items.Single(item => item.DeliveryId == a);
        Assert.Equal("Rejected", original.Decision!.Outcome);
        Assert.Null(original.TransportStatus);
        Assert.Equal(DateTimeKind.Utc, original.Decision.RecordedAtUtc!.Value.Kind);
        Assert.Equal("Partial", original.ReportsAvailability);
        Assert.Equal(2, original.Reports.Count);
        Assert.Equal(report, Assert.Single(original.Reports, item => item.FromDecisionEmail).ArtifactId);
        Assert.Contains(original.Reports, item => item.ArtifactId == additional && !item.FromDecisionEmail);

        var siblingHistory = await HistoryAsync(db, DpcRunFixture.S57, "S57");
        var delivered = Assert.Single(siblingHistory.Items);
        Assert.Null(delivered.Decision);
        Assert.Equal(siblingReport, Assert.Single(delivered.Reports).ArtifactId);
        Assert.Equal("Unavailable", (await HistoryAsync(db, DpcRunFixture.S57, "S101")).Availability);
        var exactDownload = Assert.IsType<ProductArtifactContent>(await db.Workflows.GetValidationArtifactAsync(DpcRunFixture.Source, report));
        Assert.Equal(new byte[] { 11, 22 }, exactDownload.Content);
        Assert.Null(await db.Workflows.GetValidationArtifactAsync(DpcRunFixture.S57, report));

        // The receipt's latest match moved, but persisted artifact metadata and decisions did not.
        await db.ExecuteAsync("""
            UPDATE dbo.IcEncInboundEmail SET delivery_id = @B, revision_id = @Revision, status = 'DryRun'
            WHERE inbound_id = @Id;
            """, new { B = b, Revision = laterRevision, Id = inbound });
        var after = await HistoryAsync(db);
        var retained = after.Items.Single(item => item.DeliveryId == a);
        Assert.Equal(original.Decision, retained.Decision);
        Assert.Equal(original.Reports.Select(item => item.DownloadUrl), retained.Reports.Select(item => item.DownloadUrl));
        Assert.All(retained.Reports, item => Assert.False(item.FromDecisionEmail));
        var manual = after.Items.Single(item => item.DeliveryId == b);
        Assert.Equal("Accepted", manual.Decision!.Outcome);
        Assert.Equal("Manual", manual.Decision.Source);
        Assert.Null(manual.Decision.RecordedAtUtc);
        Assert.False(Assert.Single(manual.Reports).FromDecisionEmail);
        Assert.DoesNotContain("private fixture", JsonSerializer.Serialize(after));

        await db.ExecuteAsync("UPDATE dbo.ProductIcEncDelivery SET acknowledgement_source = NULL WHERE delivery_id = @Id;",
            new { Id = b });
        var unknown = (await HistoryAsync(db)).Items.Single(item => item.DeliveryId == b);
        Assert.Equal("Accepted", unknown.Decision!.Outcome);
        Assert.Null(unknown.Decision.Source);
        Assert.Null(unknown.Decision.RecordedAtUtc);
        Assert.False(Assert.Single(unknown.Reports).FromDecisionEmail);
    }

    [DpcSqlFact]
    public async Task LimitsApplyAfterValidationAndMetadataFailureLeavesAttemptsReadable()
    {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var empty = await HistoryAsync(db);
        Assert.Equal("Available", empty.Availability);
        Assert.False(empty.HasMore!.Value);
        Assert.Empty(empty.Items);

        var live = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Delivered");
        await db.ExecuteAsync("""
            UPDATE dbo.ProductIcEncDelivery SET reserved_at_utc = @At WHERE delivery_id = @Id;
            """, new { Id = live, At = DpcRunFixture.Utc(12) });
        var older = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        await db.ExecuteAsync("UPDATE dbo.ProductIcEncDelivery SET reserved_at_utc = @At WHERE delivery_id = @Id;",
            new { Id = older, At = DpcRunFixture.Utc(11) });
        var olderInbound = await ReceiptAsync(db, older, seed.S101Revision, """{"IsSimulation":false}""");
        var olderReport = await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(older, olderInbound));
        for (var i = 0; i < 51; i++)
            await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        var simulation = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        var contradictory = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        await db.ExecuteAsync("""
            UPDATE dbo.ProductIcEncDelivery SET reserved_at_utc = @At, is_simulation = 1 WHERE delivery_id = @Simulation;
            UPDATE dbo.ProductIcEncDelivery SET reserved_at_utc = @At, acknowledgement_source = 'Simulation'
            WHERE delivery_id = @Contradictory;
            """, new { At = DpcRunFixture.Utc(13), Simulation = simulation, Contradictory = contradictory });

        var inbound = await ReceiptAsync(db, live, seed.S101Revision, """{"IsSimulation":false}""");
        for (var i = 0; i < 21; i++)
            await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(live, inbound));
        var suppressed = new List<Guid>();
        foreach (var mode in new[] { "{}", """{"IsSimulation":"false"}""", """{"IsSimulation":true}""",
            """{"IsSimulation":false,"IsSimulation":false}""", """{"IsSimulation":false,"SimulationWorkflow":true}""", "[false]" })
        {
            var unknown = await ReceiptAsync(db, live, seed.S101Revision, mode);
            suppressed.Add(await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(live, unknown)));
        }
        var syntheticMailbox = Convert.ToHexString(SHA256.HashData("ProductCatalogue.ICENC.Simulation"u8));
        var synthetic = await ReceiptAsync(db, live, seed.S101Revision, """{"IsSimulation":false}""", syntheticMailbox);
        suppressed.Add(await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(live, synthetic)));
        suppressed.Add(await ArtifactAsync(db, seed.S101Track, seed.S101Revision,
            $$"""{"Source":"IC-ENC","InboundId":"{{inbound:D}}","DeliveryId":"{{live:D}}","DeliveryId":"{{live:D}}"}"""));
        suppressed.Add(await ArtifactAsync(db, seed.S101Track, seed.S101Revision,
            $$"""{"Source":"IC-ENC","Source":"IC-ENC","DeliveryId":"{{live:D}}"}"""));
        suppressed.Add(await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(live, inbound, "Other")));
        await ArtifactAsync(db, seed.S101Track, seed.S101Revision, "[]");
        // Legacy or constraint-disabled rows can be syntactically invalid. OPENJSON must still be safe.
        await db.ExecuteAsync("ALTER TABLE dbo.ProductArtifact NOCHECK CONSTRAINT CK_ProductArtifact_MetadataJson;");
        await ArtifactAsync(db, seed.S101Track, seed.S101Revision, "{invalid");
        var siblingRevisionDelivery = await db.InsertDeliveryAsync(seed.S101Track, seed.S57Revision, "NotDelivered");
        // Exercise an invalid artifact/revision tuple with a known attempt on the same track.
        suppressed.Add(await ArtifactAsync(db, seed.S101Track, seed.S57Revision, Metadata(live, inbound)));

        // Make the incoherent delivery the newest so it cannot fall outside the bounded projection.
        await db.ExecuteAsync("UPDATE dbo.ProductIcEncDelivery SET reserved_at_utc = @At WHERE delivery_id = @Id;",
            new { At = DpcRunFixture.Utc(14), Id = siblingRevisionDelivery });
        Assert.Equal("Unavailable", (await HistoryAsync(db)).Availability);
        await db.ExecuteAsync("DELETE dbo.ProductIcEncDelivery WHERE delivery_id = @Id;", new { Id = siblingRevisionDelivery });

        var result = await HistoryAsync(db);
        Assert.True(result.HasMore!.Value);
        Assert.Equal(50, result.Items.Count);
        Assert.Equal(live, result.Items[0].DeliveryId);
        Assert.Equal(older, result.Items[1].DeliveryId);
        Assert.Equal(olderReport, Assert.Single(result.Items[1].Reports).ArtifactId);
        Assert.DoesNotContain(result.Items, item => item.DeliveryId == simulation || item.DeliveryId == contradictory);
        var attempt = result.Items[0];
        Assert.Equal("Partial", attempt.ReportsAvailability);
        Assert.Equal(20, attempt.Reports.Count);
        Assert.All(attempt.Reports, item =>
        {
            Assert.DoesNotContain(item.ArtifactId, suppressed);
            Assert.False(item.FromDecisionEmail);
            Assert.Equal("duplicate.DOC", item.FileName);
        });
        var repeated = await HistoryAsync(db);
        Assert.Equal(result.Items.Select(item => item.DeliveryId), repeated.Items.Select(item => item.DeliveryId));
        Assert.Equal(attempt.Reports.Select(item => item.ArtifactId), repeated.Items[0].Reports.Select(item => item.ArtifactId));

        await db.ExecuteAsync("EXEC sys.sp_rename N'dbo.IcEncInboundEmail', N'UnavailableReceiptFixture';");
        var unavailableReports = await HistoryAsync(db);
        Assert.Equal("Available", unavailableReports.Availability);
        Assert.Equal("Delivered", unavailableReports.Items[0].TransportStatus);
        Assert.Equal("Unavailable", unavailableReports.Items[0].ReportsAvailability);
        Assert.Empty(unavailableReports.Items[0].Reports);
    }

    [DpcSqlFact]
    public async Task EffectiveModesSelectDisjointPersistedHistoryAndVerifyWorkflowReceipts()
    {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var simulatedRevision = await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition,
            1, 0, "dataset", null, null, DpcRunFixture.Utc(10)));
        var rejectedRevision = await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition,
            1, 0, "dataset", null, null, DpcRunFixture.Utc(10)));
        var live = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Delivered");
        var simulated = await db.InsertDeliveryAsync(seed.S101Track, simulatedRevision, "Accepted");
        var rejected = await db.InsertDeliveryAsync(seed.S101Track, rejectedRevision, "Rejected");
        var contradictory = await db.InsertDeliveryAsync(seed.S101Track, simulatedRevision, "NotDelivered");
        await db.ExecuteAsync("""
            UPDATE dbo.ProductIcEncDelivery SET is_simulation = 1, acknowledgement_source = 'Simulation',
                acknowledged_at_utc = @At WHERE delivery_id IN (@Simulated, @Rejected);
            UPDATE dbo.ProductIcEncDelivery SET is_simulation = 1, acknowledgement_source = 'Email'
                WHERE delivery_id = @Contradictory;
            UPDATE dbo.ProductExportTrack SET state = 1, published_edition = 1,
                candidate_edition = NULL, candidate_update = NULL, candidate_previous_state = NULL
                WHERE product_export_track_id = @Track;
            """, new { Simulated = simulated, Rejected = rejected, Contradictory = contradictory,
                At = DpcRunFixture.Utc(11), Track = seed.S101Track });

        var liveInbound = await ReceiptAsync(db, live, seed.S101Revision, """{"IsSimulation":false}""");
        var liveReport = await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(live, liveInbound));

        var outgoing = new ValidationOutgoingFile(simulated, simulatedRevision, seed.S101Track,
            DpcRunFixture.Source, "S101", 1, 0, DpcRunFixture.Source + ".000", null,
            DpcRunFixture.Utc(10), "Delivered", IsSimulation: true);
        var first = new ValidationEmailAttachment("P007_duplicate.DOC", new byte[] { 11, 22 });
        var second = new ValidationEmailAttachment(first.Name, new byte[] { 33, 44 });
        var workflowKey = "workflow-send:fixture:S101";
        var message = new ValidationEmailMessage(ValidationSimulationIdentity.MessageId(workflowKey),
            null, "fixture@example.invalid", new DateTimeOffset(DpcRunFixture.Utc(11)), "Fixture", "Private fixture",
            [first, second], IsSimulation: true, SimulatedOutgoingFile: outgoing) { SimulationWorkflow = true };
        var receipt = await db.Mailbox.SaveSimulationAsync(workflowKey, message, default);
        var storedResult = new ValidationEmailProcessingResult("Pending", "APPLYING_ACCEPTED",
            new ValidationEmailParseResult { CanMatch = true, Outcome = ValidationEmailOutcome.Accepted }, outgoing, true);
        await db.Mailbox.SaveResultAsync(receipt.Id, storedResult, message.Attachments, default);

        var before = await HistoryAsync(db, send: "Simulation", email: "Simulation");
        var accepted = before.Items.Single(item => item.DeliveryId == simulated);
        Assert.Equal("Available", accepted.ReportsAvailability);
        Assert.Equal("Accepted", accepted.Decision!.Outcome);
        Assert.Equal("Simulation", accepted.Decision.Source);
        Assert.Equal(DpcRunFixture.Utc(11), accepted.Decision.RecordedAtUtc!.Value);
        Assert.Equal(2, accepted.Reports.Count);
        Assert.All(accepted.Reports, report =>
        {
            Assert.Equal(first.Name, report.FileName);
            Assert.EndsWith($"/artifacts/{report.ArtifactId:D}", report.DownloadUrl);
            Assert.False(report.FromDecisionEmail);
        });

        var previewKey = "preview:fixture";
        var preview = message with
        {
            Id = ValidationSimulationIdentity.MessageId(previewKey),
            SimulationWorkflow = false,
            SimulatedOutgoingFile = outgoing with { DeliveryId = Guid.NewGuid(), IsSimulation = false }
        };
        var previewReceipt = await db.Mailbox.SaveSimulationAsync(previewKey, preview, default);
        await db.Mailbox.SaveResultAsync(previewReceipt.Id, storedResult with
        {
            Status = "DryRun", Match = preview.SimulatedOutgoingFile
        }, preview.Attachments, default);
        var withoutForgedReports = await HistoryAsync(db, send: "Simulation", email: "Simulation");
        Assert.Equal(2, withoutForgedReports.Items.Count);
        Assert.All(withoutForgedReports.Items, item => Assert.Equal("Available", item.ReportsAvailability));

        // Reassociation changes only the receipt's current match. The original outgoing identity is durable.
        await db.ExecuteAsync("""
            UPDATE dbo.IcEncInboundEmail SET delivery_id = @Live, revision_id = @Revision WHERE inbound_id = @Id;
            """, new { Live = live, Revision = seed.S101Revision, Id = receipt.Id });
        var mailbox = Convert.ToHexString(SHA256.HashData("ProductCatalogue.ICENC.Simulation"u8));
        var validJson = JsonSerializer.Serialize(message);
        var capturedId = $"\"DeliveryId\":\"{simulated:D}\"";
        var malformedReceipts = new[]
        {
            """{"IsSimulation":true,"SimulationWorkflow":true,"SimulatedOutgoingFile":[]}""",
            validJson.Replace("\"SimulationWorkflow\":true", "\"SimulationWorkflow\":\"true\"", StringComparison.Ordinal),
            validJson.Replace(capturedId, $"{capturedId},{capturedId}", StringComparison.Ordinal),
            validJson.Replace(capturedId, $"\"DeliveryId\":\"{live:D}\"", StringComparison.Ordinal),
            validJson.Replace("\"IsSimulation\":true", "\"IsSimulation\":true,\"IsSimulation\":true", StringComparison.Ordinal),
            validJson.Replace("\"SimulatedOutgoingFile\":", "\"SimulatedOutgoingFile\":null,\"SimulatedOutgoingFile\":", StringComparison.Ordinal),
            validJson.Replace("\"Edition\":1", "\"Edition\":\"1\"", StringComparison.Ordinal),
        };
        foreach (var json in malformedReceipts)
        {
            Assert.NotEqual(validJson, json);
            var bad = await ReceiptAsync(db, simulated, simulatedRevision, json, mailbox);
            await ArtifactAsync(db, seed.S101Track, simulatedRevision, Metadata(simulated, bad));
        }
        var wrongMailbox = await ReceiptAsync(db, simulated, simulatedRevision, validJson);
        await ArtifactAsync(db, seed.S101Track, simulatedRevision, Metadata(simulated, wrongMailbox));
        await ArtifactAsync(db, seed.S101Track, simulatedRevision, Metadata(simulated, previewReceipt.Id));
        await ArtifactAsync(db, seed.S101Track, simulatedRevision, Metadata(simulated, liveInbound));
        await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(live, receipt.Id));

        foreach (var (send, email, legacy, simulationScope) in new[]
        {
            ("Simulation", "Simulation", "", true), ("Simulation", "", "Simulation", true),
            ("Live", "Live", "", false), ("Disabled", "Disabled", "", false),
            ("Simulation", "Disabled", "", false), ("Disabled", "Simulation", "", false),
            ("Live", "Simulation", "", false), ("Simulation", "Live", "", false),
            ("Simulation", "Disabled", "Simulation", false)
        })
        {
            var history = await HistoryAsync(db, send: send, email: email, legacyEmail: legacy);
            if (simulationScope)
            {
                Assert.Equal(2, history.Items.Count);
                var attempt = history.Items.Single(item => item.DeliveryId == simulated);
                Assert.Equal(accepted.Decision, attempt.Decision);
                Assert.Equal("Partial", attempt.ReportsAvailability);
                Assert.Equal(accepted.Reports.ToArray(), attempt.Reports.ToArray());
                var zero = history.Items.Single(item => item.DeliveryId == rejected);
                Assert.Equal("Rejected", zero.Decision!.Outcome);
                Assert.Equal("Available", zero.ReportsAvailability);
                Assert.Empty(zero.Reports);
            }
            else
            {
                var attempt = Assert.Single(history.Items);
                Assert.Equal(live, attempt.DeliveryId);
                Assert.Null(attempt.Decision);
                Assert.Equal("Partial", attempt.ReportsAvailability);
                Assert.Equal(liveReport, Assert.Single(attempt.Reports).ArtifactId);
            }
            var publicJson = JsonSerializer.Serialize(history);
            Assert.DoesNotContain("Private fixture", publicJson);
            Assert.DoesNotContain("InboundId", publicJson);
        }
        var download = await db.Workflows.GetValidationArtifactAsync(DpcRunFixture.Source, accepted.Reports[0].ArtifactId);
        Assert.Equal(first.Name, download!.FileName);
        Assert.True(first.Content.SequenceEqual(download.Content) || second.Content.SequenceEqual(download.Content));
        Assert.Equal("Unavailable", (await HistoryAsync(db, send: "99", email: "Simulation")).Availability);
        Assert.Equal("Unavailable", (await HistoryAsync(db, send: "Simulation", email: "99")).Availability);
    }

    [DpcSqlFact]
    public async Task PartialTracksInvalidRevisionsBeforeTheLinkCapWhileIgnoringUnrelatedArtifacts()
    {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var outsideSet = await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition,
            2, 0, "dataset", null, null, DpcRunFixture.Utc(10)));
        var inSet = await db.Workflows.AddRevisionAsync(new(seed.S101Track, ExportRevisionType.NewEdition,
            3, 0, "dataset", null, null, DpcRunFixture.Utc(10)));
        var wrongOutside = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        var wrongInside = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        var nullRevision = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "NotDelivered");
        var empty = await db.InsertDeliveryAsync(seed.S101Track, inSet, "NotDelivered");
        var valid = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Delivered");
        foreach (var (attempt, artifactRevision) in new (Guid, Guid?)[]
            { (wrongOutside, outsideSet), (wrongInside, inSet), (nullRevision, null) })
        {
            var receipt = await ReceiptAsync(db, attempt, seed.S101Revision, """{"IsSimulation":false}""");
            await ArtifactAsync(db, seed.S101Track, artifactRevision, Metadata(attempt, receipt));
        }
        var ownReceipt = await ReceiptAsync(db, valid, seed.S101Revision, """{"IsSimulation":false}""");
        await ArtifactAsync(db, seed.S101Track, seed.S101Revision, Metadata(valid, ownReceipt));
        await ArtifactAsync(db, seed.S57Track, seed.S57Revision, Metadata(empty, ownReceipt));
        await ArtifactAsync(db, seed.S101Track, outsideSet, Metadata(Guid.NewGuid(), ownReceipt));
        var result = await HistoryAsync(db);
        Assert.Equal(5, result.Items.Count);
        foreach (var id in new[] { wrongOutside, wrongInside, nullRevision })
        {
            var item = result.Items.Single(attempt => attempt.DeliveryId == id);
            Assert.Equal("Partial", item.ReportsAvailability);
            Assert.Empty(item.Reports);
        }
        var emptyItem = result.Items.Single(item => item.DeliveryId == empty);
        Assert.Equal("Available", emptyItem.ReportsAvailability);
        Assert.Empty(emptyItem.Reports);
        var validItem = result.Items.Single(item => item.DeliveryId == valid);
        Assert.Equal("Available", validItem.ReportsAvailability);
        Assert.Single(validItem.Reports);
    }

    private static async Task<ProductCatalogueAPI.Contracts.ProductIcEncDeliveryHistoryResponse> HistoryAsync(
        DpcSqlDatabase db, string dataset = DpcRunFixture.Source, string specification = "S101",
        string send = "", string email = "", string legacyEmail = "")
    {
        var settings = new Dictionary<string, string?>();
        if (send != "") settings["SendToIcEnc:Mode"] = send;
        if (email != "") settings["ValidationEmail:Mode"] = email;
        if (legacyEmail != "") settings["IcEncEmail:Mode"] = legacyEmail;
        using var provider = db.BuildDeliveryHistoryOptions(new ConfigurationBuilder().AddInMemoryCollection(settings).Build());
        return await provider.GetRequiredService<ProductIcEncDeliveryHistoryRepository>().GetAsync(dataset, specification,
            id => $"/electronicproducts/{Uri.EscapeDataString(dataset)}/artifacts/{id:D}", default);
    }

    private static string Metadata(Guid delivery, Guid inbound, string source = "IC-ENC") =>
        JsonSerializer.Serialize(new { DeliveryId = delivery, InboundId = inbound, Source = source });

    private static async Task<Guid> ReceiptAsync(DpcSqlDatabase db, Guid delivery, Guid revision, string json, string? mailboxKey = null)
    {
        var id = Guid.NewGuid();
        var key = mailboxKey ?? new string('A', 64);
        await db.ExecuteAsync("""
            INSERT dbo.IcEncInboundEmail (inbound_id, mailbox_key, transport_id_hash, received_at_utc, message_json,
                delivery_id, revision_id, next_attempt_at_utc, created_at_utc, updated_at_utc)
            VALUES (@Id, @Key, @Hash, @Received, @Json, @Delivery, @Revision, @At, @At, @At);
            """, new { Id = id, Key = key, Hash = SHA256.HashData(id.ToByteArray()), Received = new DateTimeOffset(DpcRunFixture.Utc(11)),
                Json = json, Delivery = delivery, Revision = revision, At = DpcRunFixture.Utc(11) });
        return id;
    }

    private static async Task<Guid> ArtifactAsync(DpcSqlDatabase db, Guid track, Guid? revision, string metadata)
    {
        var id = Guid.NewGuid();
        var content = new byte[] { 11, 22 };
        await db.ExecuteAsync("""
            INSERT dbo.ProductArtifact (product_artifact_id, product_export_track_id, product_revision_id,
                artifact_kind, file_name, media_type, content, sha256, metadata_json, created_at_utc)
            VALUES (@Id, @Track, @Revision, 'IcEncReport', 'duplicate.DOC', 'application/octet-stream',
                @Content, @Sha, @Metadata, @At);
            """, new { Id = id, Track = track, Revision = revision, Content = content,
                Sha = SHA256.HashData(content), Metadata = metadata, At = DpcRunFixture.Utc(11) });
        return id;
    }
}
