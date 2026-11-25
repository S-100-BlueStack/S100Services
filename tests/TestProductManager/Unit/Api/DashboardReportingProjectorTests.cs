using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Dashboard;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace TestProductCatalogueAPI.Unit.Api;

public class DashboardReportingProjectorTests
{
    private static readonly DateTime FromUtc = new(2026, 11, 12, 23, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime ToUtc = new(2026, 11, 14, 23, 0, 0, DateTimeKind.Utc);

    [Fact]
    public void CountsImmutableLiveDecisionsWithoutTreatingSimulationOrReadyStateAsAcceptance()
    {
        var liveAccepted = Delivery("Accepted", "S101", FromUtc.AddHours(-2), FromUtc.AddHours(2));
        var simulatedAccepted = Delivery("Accepted", "S57", FromUtc.AddHours(1), FromUtc.AddHours(3), simulation: true);
        var liveRejected = Delivery("Rejected", "S57", FromUtc.AddHours(4), FromUtc.AddHours(5));
        var livePending = Delivery("Delivered", "S101", FromUtc.AddHours(6));
        var liveUncertain = Delivery("Uncertain", "S101", null, reserved: FromUtc.AddHours(7));
        var response = Response();

        DashboardReportingProjector.Apply(response,
            new DashboardReportingSnapshot(
                [liveAccepted, simulatedAccepted, liveRejected, livePending, liveUncertain], [], []),
            Options(), [], _ => "/unused");

        Assert.NotNull(response.Distribution);
        Assert.Equal(2, response.Distribution.Live.Sent); // Rejected and still-pending delivered revisions.
        Assert.Equal(1, response.Distribution.Live.Accepted); // Accepted after an earlier send.
        Assert.Equal(1, response.Distribution.Live.Rejected);
        Assert.Equal(1, response.Distribution.Live.Pending);
        Assert.Equal(1, response.Distribution.Live.Uncertain);
        Assert.Equal(50m, response.Distribution.Live.AcceptanceRatePercent);
        Assert.Equal(1, response.Distribution.Simulation.Accepted);
        Assert.Equal(0, response.Distribution.Simulation.Pending);
        Assert.Equal(2, response.Distribution.BySpecification.Count(item => !item.IsSimulation));
    }

    [Fact]
    public void ReadyForDistributionWithoutAnIcEncDecisionDoesNotProduceAnAcceptedCount()
    {
        var response = Response();
        DashboardReportingProjector.Apply(response,
            new DashboardReportingSnapshot([], [
                Track("101DK001", "S101", ProductState.ReadyForDistribution),
                Track("DK001", "S57", ProductState.Published)
            ], []), Options(), [], _ => "/unused");

        Assert.Equal(0, response.Distribution!.Live.Accepted);
        Assert.Equal(0, response.Distribution.Live.Rejected);
        Assert.Null(response.Distribution.Live.AcceptanceRatePercent);
        Assert.Empty(response.DistributionTrend);
    }

    [Fact]
    public void DistributionTrendUsesAckTimeAndExcludesSimulatedDecisions()
    {
        var live = Delivery("Accepted", "S101", FromUtc.AddHours(3), FromUtc.AddHours(30));
        var simulation = Delivery("Rejected", "S57", FromUtc.AddHours(3), FromUtc.AddHours(30), simulation: true);
        var response = Response();
        DashboardReportingProjector.Apply(response,
            new DashboardReportingSnapshot([live, simulation], [], []), Options(), [], _ => "/unused");

        Assert.Equal(2, response.DistributionTrend.Count);
        Assert.Equal("2026-11-13", response.DistributionTrend[0].Day);
        Assert.Equal(1, response.DistributionTrend[0].Sent);
        Assert.Equal(0, response.DistributionTrend[0].Accepted);
        Assert.Equal("2026-11-14", response.DistributionTrend[1].Day);
        Assert.Equal(1, response.DistributionTrend[1].Accepted);
        Assert.Equal(0, response.DistributionTrend[1].Rejected);
    }

    [Fact]
    public void CurrentTrackHealthCountsIndependentMemberTracksNotHistoricalFailures()
    {
        var s57Track = Guid.NewGuid();
        var response = Response();
        DashboardReportingProjector.Apply(response,
            new DashboardReportingSnapshot([], [
                Track("101DK001", "S101", ProductState.Error),
                Track("DK001", "S57", ProductState.Rejected),
                new DashboardTrackRecord { TrackId = s57Track, DatasetName = "DK002", ProductSpecification = "S57", State = ProductState.Exporting, IsManuallyFrozen = true },
                new DashboardTrackRecord { TrackId = s57Track, DatasetName = "DK002", ProductSpecification = "S57", State = ProductState.Exporting, IsManuallyFrozen = true },
                Track("101DK002", "S101", ProductState.InTransit),
                Track("101DK003", "S101", ProductState.Idle)
            ], []), Options(), [], _ => "/unused");

        Assert.Equal(5, response.OperationalHealth!.Tracks);
        Assert.Equal(2, response.OperationalHealth.OpenErrors);
        Assert.Equal(1, response.OperationalHealth.Processing);
        Assert.Equal(1, response.OperationalHealth.AwaitingIcEnc);
        Assert.Equal(1, response.OperationalHealth.Paused);
    }

    [Fact]
    public void ReportMetadataKeepsTrackSpecificationRevisionAndOriginalDownloadIdentity()
    {
        var s101 = Artifact("101DK001", "S101", "IcEncReport");
        var s57 = Artifact("DK001", "S57", "ValidationReport");
        var diagnostics = Artifact("DK001", "S57", "ValidationDiagnostic");
        var response = Response();
        DashboardReportingProjector.Apply(response,
            new DashboardReportingSnapshot([], [], [s101, s57, diagnostics]),
            Options(), [], a => $"/electronicproducts/{a.DatasetName}/artifacts/{a.Id:D}");

        Assert.Equal(3, response.ReportSummary!.Total);
        Assert.Equal(1, response.ReportSummary.IcEnc);
        Assert.Equal(1, response.ReportSummary.InternalValidation);
        Assert.Equal(1, response.ReportSummary.ValidationDiagnostics);
        Assert.Equal(3, response.Summary.ReportsAvailable);
        Assert.Equal(3, response.ReportArtifacts.Count);
        Assert.Contains(response.ReportArtifacts, a => a.DatasetName == "DK001"
            && a.ProductSpecification == "S57" && a.RevisionId == s57.RevisionId
            && a.Url.EndsWith(s57.Id.ToString("D"), StringComparison.Ordinal));
    }

    [Fact]
    public void ActivityOnlyFiltersDoNotTurnReportMetadataIntoIncorrectEventLinks()
    {
        var report1 = Artifact("101DK001", "S101", "IcEncReport");
        var report2 = Artifact("101DK002", "S101", "ValidationReport");
        var selected = Activity("101DK001", "S101", "failed");
        var result = DashboardQueryProcessor.Execute([selected, Activity("101DK002", "S101", "completed")],
            Options(status: "failed"), DashboardReportingProjector.CreateReportAvailability([report1, report2]));
        var response = DashboardQueryProcessor.CreateResponse(
            new DateTimeOffset(FromUtc), new DateTimeOffset(ToUtc), new DateTimeOffset(ToUtc), result);
        DashboardReportingProjector.Apply(response,
            new DashboardReportingSnapshot([], [], [report1, report2]),
            Options(status: "failed"), result.FilteredActivities, _ => "/download");

        Assert.Single(result.PageActivities);
        Assert.Equal(1, response.Summary.ReportsAvailable);
        Assert.Equal(2, response.ReportSummary!.Total); // Whole reporting interval, not just failed activities.
        Assert.Empty(selected.Links.IcEncReports); // Preserve the frontend's full-history lazy download.
    }

    [Fact]
    public void ReportFiltersUseProductScopedArtifactEvidenceInsteadOfAnArbitraryHistoryEvent()
    {
        var withReport = Activity("DK001", "S57", "completed");
        var unrelated = Activity("DK002", "S57", "completed");
        var availability = DashboardReportingProjector.CreateReportAvailability([
            Artifact("DK001", "S57", "IcEncReport"),
            Artifact("DK002", "S57", "ValidationReport")
        ]);
        var filtered = DashboardQueryProcessor.Execute([withReport, unrelated], Options(reports: "ic-enc"), availability);

        Assert.Same(withReport, Assert.Single(filtered.PageActivities));
        Assert.Empty(withReport.Links.IcEncReports);
    }

    [Fact]
    public void ActivityTrendsAndProductBreakdownsAreComputedBeforePaging()
    {
        var source = new[]
        {
            Activity("101DK001", "S101", "failed", timestamp: new DateTimeOffset(2026, 11, 13, 9, 0, 0, TimeSpan.FromHours(1))),
            Activity("DK001", "S57", "completed", timestamp: new DateTimeOffset(2026, 11, 13, 10, 0, 0, TimeSpan.FromHours(1))),
            Activity("101DK002", "S101", "active", timestamp: new DateTimeOffset(2026, 11, 14, 10, 0, 0, TimeSpan.FromHours(1)))
        };
        var result = DashboardQueryProcessor.Execute(source, Options(pageSize: 1));
        var response = DashboardQueryProcessor.CreateResponse(
            new DateTimeOffset(FromUtc), new DateTimeOffset(ToUtc), new DateTimeOffset(ToUtc), result);

        Assert.Single(response.Activities);
        Assert.Equal(3, response.Summary.TotalActivities);
        Assert.Equal(2, response.ActivityTrend.Count);
        Assert.Equal(2, response.ActivityTrend[0].Activities);
        Assert.Equal(1, response.ActivityTrend[0].Failed);
        Assert.Equal(2, response.ProductBreakdown.Single(b => b.ProductSpecification == "S101").Activities);
        Assert.Equal(1, response.ProductBreakdown.Single(b => b.ProductSpecification == "S57").Activities);
    }

    private static DashboardDeliveryRecord Delivery(string status, string specification, DateTime? completed,
        DateTime? acknowledged = null, bool simulation = false, DateTime? reserved = null) => new()
    {
        Id = Guid.NewGuid(),
        RevisionId = Guid.NewGuid(),
        DatasetName = specification == "S57" ? "DK001" : "101DK001",
        ProductSpecification = specification,
        Status = status,
        IsSimulation = simulation,
        CompletedAtUtc = completed,
        AcknowledgedAtUtc = acknowledged,
        ReservedAtUtc = reserved ?? FromUtc
    };

    private static DashboardTrackRecord Track(string dataset, string specification, ProductState state) => new()
    {
        TrackId = Guid.NewGuid(), DatasetName = dataset, ProductSpecification = specification, State = state
    };

    private static DashboardArtifactRecord Artifact(string dataset, string specification, string kind) => new()
    {
        Id = Guid.NewGuid(),
        TrackId = Guid.NewGuid(),
        RevisionId = Guid.NewGuid(),
        DatasetName = dataset,
        ProductSpecification = specification,
        Kind = kind,
        FileName = $"{kind}.xml",
        CreatedAtUtc = FromUtc.AddHours(3)
    };

    private static DashboardActivityResponse Activity(string dataset, string specification, string status,
        DateTimeOffset? timestamp = null) => new()
    {
        Id = Guid.NewGuid().ToString("D"),
        DatasetName = dataset,
        ProductName = dataset,
        ProductSpecification = specification,
        Status = status,
        Type = "export",
        Severity = status == "failed" ? "critical" : "normal",
        Title = "Export",
        Timestamp = timestamp ?? new DateTimeOffset(FromUtc.AddHours(5))
    };

    private static DashboardResponse Response() => new()
    {
        GeneratedAt = new DateTimeOffset(ToUtc),
        Range = new DashboardRangeResponse
        {
            From = new DateTimeOffset(FromUtc),
            To = new DateTimeOffset(ToUtc)
        }
    };

    private static DashboardQueryOptions Options(string status = "all", string reports = "all", int? pageSize = 50) =>
        new("", "all", "all", status, "all", reports, pageSize, null);
}
