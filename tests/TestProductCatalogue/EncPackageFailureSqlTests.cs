using Microsoft.Data.SqlClient;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;
using ProductCatalogueAPI.Services.ValidationEmail;

namespace TestProductCatalogueAPI;

/// <summary>Opt-in tests of the actual SQL transaction against the existing uniquely named disposable test database.</summary>
public sealed class EncPackageFailureSqlTests
{
    /// <summary>Mixed acceptance resets both candidates, retains decisions, records independent cutoff/edition floors, and replays without touching a newer package.</summary>
    [DpcSqlFact]
    public async Task MixedDecisionAcknowledgementIsAtomicDurableAndIdempotent() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var cutoff = DpcRunFixture.Utc(12).AddTicks(1234567);
        await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Accepted");
        await db.InsertDeliveryAsync(seed.S57Track, seed.S57Revision, "Rejected");
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.AcceptedForDistribution, "provider", DpcRunFixture.Utc(11));
        await db.Workflows.SetStateAsync(seed.S57Track, ProductState.Rejected, "provider", DpcRunFixture.Utc(11), "IC_ENC_REJECTED", "Rejected");
        await db.Packages.MarkReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(8));
        await db.Workflows.SetSuccessfulRunUtcAsync(nameof(DetectProductChangesJob), DpcRunFixture.Utc(10));

        var result = await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "test operator", cutoff);

        Assert.Equal(EncPackageFailureAcknowledgementStatus.Acknowledged, result.Status);
        Assert.Equal(cutoff, result.AcknowledgedAtUtc);
        Assert.Null(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.NotNull(await db.Packages.GetAcknowledgedSourceYamlAsync(DpcRunFixture.Source));
        Assert.Empty(await db.Packages.GetReplayBoundsAsync());
        Assert.Equal(cutoff, await db.Packages.GetFailureAcknowledgedAtUtcAsync(DpcRunFixture.Source));
        Assert.Equal(DpcRunFixture.Utc(10), await db.Workflows.GetLastSuccessfulRunUtcAsync(nameof(DetectProductChangesJob)));
        foreach (var (name, spec, published, next) in new[] { (DpcRunFixture.Source, ProductSpecification.S101, 0, 2), (DpcRunFixture.S57, ProductSpecification.S57, 4, 6) }) {
            var track = (await db.Workflows.GetTrackAsync(name, spec))!;
            Assert.Equal(ProductState.Idle, track.State);
            Assert.Null(track.CandidateEdition);
            Assert.Null(track.CandidateUpdate);
            Assert.Null(track.CandidatePreviousState);
            Assert.Null(track.ErrorCode);
            Assert.Null(track.ErrorMessage);
            Assert.Equal(published, track.PublishedEdition);
            Assert.Equal(next, track.NextNewEdition);
        }
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductIcEncDelivery WHERE status IN ('Accepted', 'Rejected');"));
        // Even a delayed old scan cannot restore a pre-acknowledgement replay window.
        await db.Packages.MarkReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(8));
        Assert.Equal(cutoff, (await db.Packages.GetReplayBoundsAsync())[DpcRunFixture.Source]);
        var stalePackage = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = DpcRunFixture.Source, S57DatasetName = DpcRunFixture.S57,
            ScanFromUtc = DpcRunFixture.Utc(8), DetectedAtUtc = DpcRunFixture.Utc(14), DatasetYaml = "stale source", SummaryYaml = "old window" };
        Assert.False(await db.Packages.TryCreateAsync(stalePackage));
        var nextPackage = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = DpcRunFixture.Source, S57DatasetName = DpcRunFixture.S57,
            ScanFromUtc = cutoff, DetectedAtUtc = DpcRunFixture.Utc(14), DatasetYaml = "new source", SummaryYaml = "new edit" };
        Assert.True(await db.Packages.TryCreateAsync(nextPackage));
        var replay = await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "retry operator", DpcRunFixture.Utc(16));
        Assert.Equal(EncPackageFailureAcknowledgementStatus.AlreadyAcknowledged, replay.Status);
        Assert.Equal(result.AcknowledgedAtUtc, replay.AcknowledgedAtUtc);
        Assert.NotNull(await db.Packages.GetByIdAsync(nextPackage.Id));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductStateHistory WHERE error_code = @Code;", new { Code = EncPackageFailureRules.HistoryCode }));
    }

    /// <summary>Failures discovered by a later mailbox tick expose only the exact still-current simulated package, never a live or newer attempt.</summary>
    [DpcSqlFact]
    public async Task LaterMailboxFailureIsBoundToTheCurrentSimulatedRevision() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        var deliveryId = await db.InsertDeliveryAsync(seed.S101Track, seed.S101Revision, "Delivered");
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.InTransit, "fixture", DpcRunFixture.Utc(11));
        var outgoing = new ValidationOutgoingFile(deliveryId, seed.S101Revision, seed.S101Track, DpcRunFixture.Source, "S101", 1, 0,
            DpcRunFixture.Source + ".000", null, DpcRunFixture.Utc(10), "Delivered") { IsSimulation = true };
        var message = new ValidationEmailMessage("simulation", "<simulation@example.invalid>", "simulation@example.invalid", new DateTimeOffset(DpcRunFixture.Utc(11)),
            "Synthetic acceptance", "SIMULATION", [], false, null, true, outgoing) { SimulationWorkflow = true };
        await db.Mailbox.RecordWorkflowProcessingFailureAsync(message, default);
        Assert.Null((await db.Packages.GetByIdAsync(seed.Package.Id))!.ErrorMessage); // Permanent live provenance wins over message metadata.
        await db.ExecuteAsync("UPDATE dbo.ProductIcEncDelivery SET is_simulation = 1 WHERE delivery_id = @Id;", new { Id = deliveryId });
        await db.Mailbox.RecordWorkflowProcessingFailureAsync(message, default);
        Assert.Equal(EncPackageFailureRules.SendFailureMessage, (await db.Packages.GetByIdAsync(seed.Package.Id))!.ErrorMessage);
        Assert.Equal(EncPackageFailureAcknowledgementStatus.Conflict,
            (await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "operator", DpcRunFixture.Utc(12))).Status);
        Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
        // Retire this fixture through an actual provider rejection before checking stale processing.
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.Rejected, "provider", DpcRunFixture.Utc(12), "IC_ENC_REJECTED", "Rejected");
        Assert.Equal(EncPackageFailureAcknowledgementStatus.Acknowledged,
            (await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "operator", DpcRunFixture.Utc(12))).Status);
        var replacement = new EncPackage { Id = Guid.NewGuid(), SourceDatasetName = DpcRunFixture.Source, S57DatasetName = DpcRunFixture.S57,
            ScanFromUtc = DpcRunFixture.Utc(12), DetectedAtUtc = DpcRunFixture.Utc(14), DatasetYaml = "new source", SummaryYaml = "new edits" };
        Assert.True(await db.Packages.TryCreateAsync(replacement));
        await db.Mailbox.RecordWorkflowProcessingFailureAsync(message, default);
        Assert.Null((await db.Packages.GetByIdAsync(replacement.Id))!.ErrorMessage);
    }

    /// <summary>SevenCs failures cannot retire candidates or create an acknowledgement cutoff through a direct API retry.</summary>
    [DpcSqlFact]
    public async Task ValidationFailureCannotBeAcknowledgedInTheTransaction() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.Error, "validator", DpcRunFixture.Utc(11), "SEVENCS_VALIDATION_FAILED", "Critical findings");
        await db.Packages.SetErrorAsync(seed.Package.Id, "A candidate failed validation.");

        var result = await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "operator", DpcRunFixture.Utc(12));

        Assert.Equal(EncPackageFailureAcknowledgementStatus.Conflict, result.Status);
        Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.Null(await db.Packages.GetFailureAcknowledgedAtUtcAsync(DpcRunFixture.Source));
        Assert.Equal(ProductState.Error, (await db.Workflows.GetTrackAsync(DpcRunFixture.Source, ProductSpecification.S101))!.State);
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE candidate_edition IS NOT NULL;"));
    }

    /// <summary>A second-member database failure rolls back the first reset, cutoff, edition floor, replay deletion and package deletion.</summary>
    [DpcSqlFact]
    public async Task SecondMemberFailureRollsBackTheCompleteAcknowledgement() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.Rejected, "provider", DpcRunFixture.Utc(11), "IC_ENC_REJECTED", "Rejected");
        await db.Packages.MarkReplayAsync(DpcRunFixture.Source, DpcRunFixture.Utc(8));
        await db.ExecuteAsync("""
            CREATE TRIGGER dbo.FailFailureAcknowledgement ON dbo.ProductExportTrack AFTER UPDATE AS
            IF EXISTS (SELECT 1 FROM inserted WHERE product_specification = 'S57' AND candidate_edition IS NULL)
                THROW 51203, 'Injected second member acknowledgement failure', 1;
            """);
        await Assert.ThrowsAsync<SqlException>(() => db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "operator", DpcRunFixture.Utc(12)));
        Assert.NotNull(await db.Packages.GetByIdAsync(seed.Package.Id));
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE candidate_edition IS NOT NULL;"));
        Assert.Null(await db.Packages.GetFailureAcknowledgedAtUtcAsync(DpcRunFixture.Source));
        Assert.Equal(DpcRunFixture.Utc(8), (await db.Packages.GetReplayBoundsAsync())[DpcRunFixture.Source]);
    }

    /// <summary>A preflight failure cannot retire candidates; an eventual provider rejection can, and stale jobs cannot reopen them.</summary>
    [DpcSqlFact]
    public async Task ExactSendFailureRequiresRejectionBeforeAcknowledgement() {
        await using var db = await DpcSqlDatabase.CreateAsync();
        var seed = await db.SeedAsync(deliver: false);
        EncPackageSendMember[] members = [new(DpcRunFixture.Source, ProductSpecification.S101, 1, 0, seed.S101Revision), new(DpcRunFixture.S57, ProductSpecification.S57, 5, 0, seed.S57Revision)];
        await db.Packages.RecordSendFailureAsync(DpcRunFixture.Source, seed.Package.Id, members, "job-1");
        Assert.NotNull((await db.Packages.GetByIdAsync(seed.Package.Id))!.ErrorMessage);
        Assert.Equal(EncPackageFailureAcknowledgementStatus.Conflict,
            (await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "operator", DpcRunFixture.Utc(12))).Status);
        Assert.Equal(2, await db.QueryAsync<int>("SELECT COUNT(*) FROM dbo.ProductExportTrack WHERE candidate_edition IS NOT NULL;"));
        await db.Workflows.SetStateAsync(seed.S101Track, ProductState.Rejected, "provider", DpcRunFixture.Utc(12), "IC_ENC_REJECTED", "Rejected");
        Assert.Equal(EncPackageFailureAcknowledgementStatus.Acknowledged,
            (await db.Packages.TryAcknowledgeFailureAsync(DpcRunFixture.Source, seed.Package.Id, "operator", DpcRunFixture.Utc(12))).Status);
        await db.Packages.RecordSendFailureAsync(DpcRunFixture.Source, seed.Package.Id, members, "job-1");
        Assert.Null(await db.Packages.GetByIdAsync(seed.Package.Id));
    }
}
