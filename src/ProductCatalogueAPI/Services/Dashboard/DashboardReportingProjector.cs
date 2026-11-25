using System.Globalization;
using ProductCatalogueAPI.Contracts;
using ProductCatalogueAPI.Data.Models;
using static ProductCatalogueAPI.Contracts.ResponseTypes;

namespace ProductCatalogueAPI.Services.Dashboard;

/// <summary>
/// Builds additive reporting views from authoritative delivery, current-track and artifact metadata.
/// Reporting never mutates the independently owned workflow or infers acceptance from history titles.
/// </summary>
public static class DashboardReportingProjector
{
    private static readonly HashSet<string> ReportKinds = new(StringComparer.Ordinal)
    {
        nameof(ProductArtifactKind.IcEncReport),
        nameof(ProductArtifactKind.ValidationReport),
        nameof(ProductArtifactKind.ValidationDiagnostic)
    };

    /// <summary>
    /// Report filters are Product-scoped. State-history events do not store revision IDs,
    /// so a report is not attributed to an arbitrary event with the same edition/update.
    /// </summary>
    public static IReadOnlyDictionary<string, DashboardReportAvailability> CreateReportAvailability(
        IEnumerable<DashboardArtifactRecord> artifacts)
    {
        ArgumentNullException.ThrowIfNull(artifacts);
        return artifacts.Where(a => ReportKinds.Contains(a.Kind))
            .GroupBy(a => a.DatasetName, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key,
                group => new DashboardReportAvailability(
                    group.Any(a => a.Kind == nameof(ProductArtifactKind.IcEncReport)),
                    group.Any(a => a.Kind is nameof(ProductArtifactKind.ValidationReport)
                        or nameof(ProductArtifactKind.ValidationDiagnostic))),
                StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>Enriches the existing paged Dashboard response without changing paging or history filters.</summary>
    public static void Apply(
        DashboardResponse response,
        DashboardReportingSnapshot snapshot,
        DashboardQueryOptions options,
        IReadOnlyList<DashboardActivityResponse> filteredActivities,
        Func<DashboardArtifactRecord, string> createDownloadUrl)
    {
        ArgumentNullException.ThrowIfNull(response);
        ArgumentNullException.ThrowIfNull(snapshot);
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(filteredActivities);
        ArgumentNullException.ThrowIfNull(createDownloadUrl);

        var fromUtc = response.Range.From.UtcDateTime;
        var toUtc = response.Range.To.UtcDateTime;
        var deliveries = snapshot.Deliveries.Where(d =>
            IsInRange(d.CompletedAtUtc, fromUtc, toUtc)
            || IsInRange(d.AcknowledgedAtUtc, fromUtc, toUtc)
            || (d.Status == "Uncertain" && IsInRange(d.ReservedAtUtc, fromUtc, toUtc))).ToArray();
        var artifacts = snapshot.Artifacts.Where(a =>
            ReportKinds.Contains(a.Kind) && IsInRange(a.CreatedAtUtc, fromUtc, toUtc)).ToArray();

        response.Distribution = new DashboardDistributionSummaryResponse
        {
            Live = CountDeliveries(deliveries.Where(d => !d.IsSimulation), fromUtc, toUtc),
            Simulation = CountDeliveries(deliveries.Where(d => d.IsSimulation), fromUtc, toUtc),
            BySpecification = [.. deliveries.GroupBy(d => (d.ProductSpecification, d.IsSimulation))
                .OrderBy(g => g.Key.ProductSpecification, StringComparer.Ordinal)
                .ThenBy(g => g.Key.IsSimulation)
                .Select(g => new DashboardDistributionBreakdownResponse
                {
                    ProductSpecification = g.Key.ProductSpecification,
                    IsSimulation = g.Key.IsSimulation,
                    Counts = CountDeliveries(g, fromUtc, toUtc)
                })]
        };

        var tracks = snapshot.Tracks.DistinctBy(track => track.TrackId).ToArray();
        response.OperationalHealth = new DashboardOperationalHealthResponse
        {
            AsOfUtc = response.GeneratedAt.ToUniversalTime(),
            Tracks = tracks.Length,
            OpenErrors = tracks.Count(t => t.State is ProductState.Error or ProductState.Rejected),
            Processing = tracks.Count(t => t.State is ProductState.Exporting or ProductState.Validating),
            AwaitingIcEnc = tracks.Count(t => t.State == ProductState.InTransit),
            Paused = tracks.Count(t => t.IsManuallyFrozen || t.State == ProductState.Frozen)
        };
        response.ReportSummary = new DashboardReportSummaryResponse
        {
            Total = artifacts.Length,
            IcEnc = artifacts.Count(a => a.Kind == nameof(ProductArtifactKind.IcEncReport)),
            InternalValidation = artifacts.Count(a => a.Kind == nameof(ProductArtifactKind.ValidationReport)),
            ValidationDiagnostics = artifacts.Count(a => a.Kind == nameof(ProductArtifactKind.ValidationDiagnostic))
        };

        response.DistributionTrend = CreateDistributionTrend(deliveries.Where(d => !d.IsSimulation), fromUtc, toUtc);
        response.ReportArtifacts = [.. artifacts.OrderByDescending(a => a.CreatedAtUtc).ThenBy(a => a.Id)
            .Select(a => new DashboardReportArtifactResponse
            {
                Id = a.Id,
                RevisionId = a.RevisionId,
                DatasetName = a.DatasetName,
                ProductSpecification = a.ProductSpecification,
                Kind = a.Kind,
                FileName = a.FileName,
                CreatedAtUtc = new DateTimeOffset(AsUtc(a.CreatedAtUtc)),
                Url = createDownloadUrl(a)
            })];

        // Match the filtered Product set when activity filters are active; otherwise count all
        // stored report files in the selected interval, even if no state transition occurred.
        var activityFiltersActive = !string.IsNullOrWhiteSpace(options.Search)
            || options.Type != DashboardQueryOptions.AnyValue
            || options.Status != DashboardQueryOptions.AnyValue
            || options.Importance != DashboardQueryOptions.AnyValue
            || options.Reports != DashboardQueryOptions.AnyValue;
        var visibleProducts = filteredActivities.Select(a => a.DatasetName)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        response.Summary.ReportsAvailable = artifacts.Count(a =>
            (!activityFiltersActive || visibleProducts.Contains(a.DatasetName))
            && (options.Reports switch
            {
                "ic-enc" => a.Kind == nameof(ProductArtifactKind.IcEncReport),
                "internal-validation" => a.Kind is nameof(ProductArtifactKind.ValidationReport)
                    or nameof(ProductArtifactKind.ValidationDiagnostic),
                _ => true
            }));
    }

    private static DashboardDistributionCountsResponse CountDeliveries(
        IEnumerable<DashboardDeliveryRecord> source, DateTime fromUtc, DateTime toUtc)
    {
        var deliveries = source.DistinctBy(d => d.Id).ToArray();
        var accepted = deliveries.Count(d => d.Status == "Accepted" && IsInRange(d.AcknowledgedAtUtc, fromUtc, toUtc));
        var rejected = deliveries.Count(d => d.Status == "Rejected" && IsInRange(d.AcknowledgedAtUtc, fromUtc, toUtc));
        var decisions = accepted + rejected;
        return new DashboardDistributionCountsResponse
        {
            Sent = deliveries.Count(d => (d.Status is "Delivered" or "Accepted" or "Rejected")
                && IsInRange(d.CompletedAtUtc, fromUtc, toUtc)),
            Accepted = accepted,
            Rejected = rejected,
            Pending = deliveries.Count(d => d.Status == "Delivered" && IsInRange(d.CompletedAtUtc, fromUtc, toUtc)),
            Uncertain = deliveries.Count(d => d.Status == "Uncertain" && IsInRange(d.ReservedAtUtc, fromUtc, toUtc)),
            AcceptanceRatePercent = decisions == 0 ? null : Math.Round(100m * accepted / decisions, 1)
        };
    }

    private static List<DashboardDistributionTrendResponse> CreateDistributionTrend(
        IEnumerable<DashboardDeliveryRecord> source, DateTime fromUtc, DateTime toUtc)
    {
        var points = new Dictionary<string, DashboardDistributionTrendResponse>(StringComparer.Ordinal);
        foreach (var delivery in source.DistinctBy(d => d.Id))
        {
            if ((delivery.Status is "Delivered" or "Accepted" or "Rejected")
                && IsInRange(delivery.CompletedAtUtc, fromUtc, toUtc))
                GetPoint(delivery.CompletedAtUtc!.Value).Sent++;
            if (delivery.Status == "Accepted" && IsInRange(delivery.AcknowledgedAtUtc, fromUtc, toUtc))
                GetPoint(delivery.AcknowledgedAtUtc!.Value).Accepted++;
            if (delivery.Status == "Rejected" && IsInRange(delivery.AcknowledgedAtUtc, fromUtc, toUtc))
                GetPoint(delivery.AcknowledgedAtUtc!.Value).Rejected++;
        }
        return [.. points.Values.OrderBy(p => p.Day, StringComparer.Ordinal)];

        DashboardDistributionTrendResponse GetPoint(DateTime utc)
        {
            var day = DanishDay(utc);
            if (!points.TryGetValue(day, out var point))
            {
                point = new DashboardDistributionTrendResponse { Day = day };
                points.Add(day, point);
            }
            return point;
        }
    }

    private static readonly Lazy<TimeZoneInfo> DanishTimeZone = new(() =>
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("Europe/Copenhagen"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time"); }
        catch (InvalidTimeZoneException) { return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time"); }
    });

    private static string DanishDay(DateTime utc)
    {
        // Conversion from an instant (rather than local midnight) remains safe across DST changes.
        return TimeZoneInfo.ConvertTimeFromUtc(AsUtc(utc), DanishTimeZone.Value)
            .ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    private static bool IsInRange(DateTime? instant, DateTime fromUtc, DateTime toUtc) =>
        instant.HasValue && IsInRange(instant.Value, fromUtc, toUtc);

    private static bool IsInRange(DateTime instant, DateTime fromUtc, DateTime toUtc) =>
        AsUtc(instant) >= fromUtc && AsUtc(instant) < toUtc;

    private static DateTime AsUtc(DateTime value) =>
        value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };

}
