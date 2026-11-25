using ProductCatalogueAPI.Services.Dashboard;

namespace TestProductCatalogueAPI.Unit.Api;

/// <summary>Verifies the Copenhagen date filters used to query UTC history.</summary>
public sealed class DashboardTimeTests
{
    /// <summary>Interprets a date-only end as the next local midnight, including the daylight-saving jump.</summary>
    [Fact]
    public void DateOnlyRangeIncludesTheWholeShortSpringDay() {
        var success = DashboardTime.TryCreateDashboardRange("2026-03-29", "2026-03-29",
            out var localFrom, out var localTo, out var utcFrom, out var utcTo, out var error);

        Assert.True(success, error);
        Assert.Equal(TimeSpan.FromHours(1), localFrom.Offset);
        Assert.Equal(TimeSpan.FromHours(2), localTo.Offset);
        Assert.Equal(new DateTime(2026, 3, 28, 23, 0, 0, DateTimeKind.Utc), utcFrom);
        Assert.Equal(new DateTime(2026, 3, 29, 22, 0, 0, DateTimeKind.Utc), utcTo);
    }

    /// <summary>Rejects a local clock time skipped during the Copenhagen daylight-saving transition.</summary>
    [Fact]
    public void NonexistentLocalTimeReturnsValidationError() {
        var success = DashboardTime.TryCreateDashboardRange("2026-03-29T02:30:00", "2026-03-29",
            out _, out _, out _, out _, out var error);

        Assert.False(success);
        Assert.Contains("daylight saving time", error!);
    }
}
