using ProductCatalogueAPI.Services.Dashboard;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace TestProductCatalogueAPI;

public class DashboardQueryProcessorTests
{
    [Fact]
    public void FiltersBeforePagingAndKeepsCompleteFilteredTotal()
    {
        var activities = new[]
        {
            Activity("c", "101DK003", "export", "failed", 3),
            Activity("b", "101DK002", "export", "completed", 2),
            Activity("a", "101DK001", "freeze", "active", 1)
        };
        var options = CreateOptions(type: "export", pageSize: 1);

        var result = DashboardQueryProcessor.Execute(activities, options);

        Assert.Equal(2, result.FilteredActivities.Count);
        Assert.Single(result.PageActivities);
        Assert.Equal("b", result.PageActivities[0].Id);
        Assert.Equal(2, result.Paging.Total);
        Assert.Equal(1, result.Paging.Returned);
        Assert.True(result.Paging.HasMore);
        Assert.NotNull(result.Paging.NextCursor);
    }

    [Fact]
    public void OmittingPageSizePreservesTheCompleteFilteredList()
    {
        var activities = new[]
        {
            Activity("c", "101DK003", "export", "failed", 3),
            Activity("b", "101DK002", "export", "completed", 2),
            Activity("a", "101DK001", "freeze", "active", 1)
        };

        var result = DashboardQueryProcessor.Execute(
            activities,
            CreateOptions(type: "export"));

        Assert.Equal(2, result.PageActivities.Count);
        Assert.Null(result.Paging.PageSize);
        Assert.Equal(2, result.Paging.Returned);
        Assert.Equal(2, result.Paging.Total);
        Assert.False(result.Paging.HasMore);
        Assert.Null(result.Paging.NextCursor);
    }

    [Fact]
    public void FilterOptionsRemainAvailableFromTheCompleteDateRangeSource()
    {
        var activities = new[]
        {
            Activity("b", "101DK002", "freeze", "active", 2),
            Activity("a", "101DK001", "export", "completed", 1)
        };

        var result = DashboardQueryProcessor.Execute(
            activities,
            CreateOptions(type: "export", pageSize: 1));

        Assert.Equal(
            new[] { "export", "freeze" },
            result.FilterOptions.Types.Select(option => option.Value));
        Assert.Equal(
            new[] { "101DK001", "101DK002" },
            result.FilterOptions.Products.Select(option => option.Value));
    }

    [Fact]
    public void ResponseSummaryUsesCompleteFilteredResultInsteadOfVisiblePage()
    {
        var activities = new[]
        {
            Activity("c", "101DK003", "export", "failed", 3),
            Activity("b", "101DK002", "export", "completed", 2),
            Activity("a", "101DK001", "freeze", "active", 1)
        };
        var result = DashboardQueryProcessor.Execute(
            activities,
            CreateOptions(type: "export", pageSize: 1));

        var response = DashboardQueryProcessor.CreateResponse(
            DateTimeOffset.Parse("2026-07-20T00:00:00+02:00"),
            DateTimeOffset.Parse("2026-07-27T12:00:00+02:00"),
            DateTimeOffset.Parse("2026-07-27T12:05:00+02:00"),
            result);

        Assert.Single(response.Activities);
        Assert.Equal(2, response.Summary.TotalActivities);
        Assert.Equal(2, response.Summary.ProductsTouched);
        Assert.Equal(1, response.Summary.FailedOperations);
        Assert.Equal(2, Assert.Single(response.OperationSummary).Count);
    }

    [Fact]
    public void CursorOrderingIsStableWhenTimestampsAreEqual()
    {
        var timestamp = DateTimeOffset.Parse("2026-07-27T10:00:00+02:00");
        var activities = new[]
        {
            Activity("a", "101DK001", "export", "completed", timestamp: timestamp),
            Activity("c", "101DK003", "export", "completed", timestamp: timestamp),
            Activity("b", "101DK002", "export", "completed", timestamp: timestamp)
        };
        var first = DashboardQueryProcessor.Execute(activities, CreateOptions(pageSize: 2));
        var second = DashboardQueryProcessor.Execute(
            activities,
            CreateOptions(pageSize: 2, cursor: first.Paging.NextCursor));

        Assert.Equal(new[] { "c", "b" }, first.PageActivities.Select(item => item.Id));
        Assert.Equal(new[] { "a" }, second.PageActivities.Select(item => item.Id));
        Assert.Empty(first.PageActivities.Select(item => item.Id)
            .Intersect(second.PageActivities.Select(item => item.Id)));
    }

    [Fact]
    public void SearchImportanceAndProductFiltersAreCaseInsensitive()
    {
        var activities = new[]
        {
            Activity("a", "101DK001", "validation", "failed", 2, title: "Validation failed"),
            Activity("b", "101DK002", "export", "completed", 1, title: "Export completed")
        };
        var options = CreateOptions(
            search: "VALIDATION",
            product: "101dk001",
            importance: "failed");

        var result = DashboardQueryProcessor.Execute(activities, options);

        var activity = Assert.Single(result.PageActivities);
        Assert.Equal("a", activity.Id);
    }

    [Fact]
    public void ReportFilterUsesReportCollections()
    {
        var withReport = Activity("a", "101DK001", "analysis", "completed", 2);
        withReport.Links.IcEncReports.Add(new DashboardReportLinkResponse { Id = "report-1" });
        var withoutReport = Activity("b", "101DK002", "analysis", "completed", 1);

        var result = DashboardQueryProcessor.Execute(
            new[] { withReport, withoutReport },
            CreateOptions(reports: "ic-enc"));

        Assert.Equal("a", Assert.Single(result.PageActivities).Id);
    }

    [Fact]
    public void EmptyFilteredResultReturnsEmptyPageAndZeroSummary()
    {
        var result = DashboardQueryProcessor.Execute(
            new[] { Activity("a", "101DK001", "export", "completed", 1) },
            CreateOptions(status: "failed", pageSize: 50));

        var response = DashboardQueryProcessor.CreateResponse(
            DateTimeOffset.Parse("2026-07-20T00:00:00+02:00"),
            DateTimeOffset.Parse("2026-07-27T12:00:00+02:00"),
            DateTimeOffset.Parse("2026-07-27T12:05:00+02:00"),
            result);

        Assert.Empty(response.Activities);
        Assert.Equal(0, response.Summary.TotalActivities);
        Assert.Equal(0, response.Paging.Total);
        Assert.False(response.Paging.HasMore);
    }

    [Theory]
    [InlineData("urgent", null, "The 'importance' query parameter must be one of: all, important, failed.")]
    [InlineData(null, "external", "The 'reports' query parameter must be one of: all, any, ic-enc, internal-validation.")]
    public void RejectsInvalidFilterValues(
        string? importance,
        string? reports,
        string expectedMessage)
    {
        var valid = DashboardQueryOptions.TryCreate(
            null, null, null, null, importance, reports, null, null,
            out _, out var validationMessage);

        Assert.False(valid);
        Assert.Equal(expectedMessage, validationMessage);
    }

    [Theory]
    [InlineData(0, null, "The 'pageSize' query parameter must be between 1 and 200.")]
    [InlineData(201, null, "The 'pageSize' query parameter must be between 1 and 200.")]
    [InlineData(null, "cursor", "The 'cursor' query parameter requires 'pageSize'.")]
    [InlineData(50, "not-a-valid-cursor", "The 'cursor' query parameter is invalid.")]
    public void RejectsInvalidPaging(int? pageSize, string? cursor, string expectedMessage)
    {
        var valid = DashboardQueryOptions.TryCreate(
            null, null, null, null, null, null, pageSize, cursor,
            out _, out var validationMessage);

        Assert.False(valid);
        Assert.Equal(expectedMessage, validationMessage);
    }

    private static DashboardQueryOptions CreateOptions(
        string search = "",
        string product = "all",
        string type = "all",
        string status = "all",
        string importance = "all",
        string reports = "all",
        int? pageSize = null,
        string? cursor = null)
    {
        var valid = DashboardQueryOptions.TryCreate(
            search, product, type, status, importance, reports, pageSize, cursor,
            out var options, out var validationMessage);

        Assert.True(valid, validationMessage);
        return options;
    }

    private static DashboardActivityResponse Activity(
        string id,
        string datasetName,
        string type,
        string status,
        int hoursAgo = 0,
        string? title = null,
        DateTimeOffset? timestamp = null) =>
        new()
        {
            Id = id,
            Timestamp = timestamp
                ?? DateTimeOffset.Parse("2026-07-27T12:00:00+02:00").AddHours(-hoursAgo),
            DatasetName = datasetName,
            ProductName = datasetName,
            Type = type,
            Severity = status == "failed" ? "critical" : "normal",
            Title = title ?? type,
            Status = status,
            Links = new DashboardActivityLinksResponse()
        };
}
