using System.Globalization;
using System.Text;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace ProductCatalogueAPI.Services.Dashboard;

public sealed record DashboardQueryOptions(
    string Search,
    string Product,
    string Type,
    string Status,
    string Importance,
    string Reports,
    int? PageSize,
    string? Cursor,
    string SortBy = "time",
    string SortDirection = "desc")
{
    public const int MaximumPageSize = 200;
    public const string AnyValue = "all";

    private static readonly HashSet<string> ImportanceValues =
        new(StringComparer.OrdinalIgnoreCase) { AnyValue, "important", "failed" };

    private static readonly HashSet<string> ReportValues =
        new(StringComparer.OrdinalIgnoreCase) { AnyValue, "any", "ic-enc", "internal-validation" };

    public static bool TryCreate(
        string? search,
        string? product,
        string? type,
        string? status,
        string? importance,
        string? reports,
        int? pageSize,
        string? cursor,
        out DashboardQueryOptions options,
        out string? validationMessage,
        string? sortBy = null,
        string? sortDirection = null)
    {
        var normalizedImportance = NormalizeToken(importance, AnyValue);
        var normalizedReports = NormalizeToken(reports, AnyValue);
        var normalizedCursor = NormalizeOptionalText(cursor);

        options = new DashboardQueryOptions(
            NormalizeOptionalText(search) ?? string.Empty,
            NormalizeOptionalText(product) ?? AnyValue,
            NormalizeToken(type, AnyValue),
            NormalizeToken(status, AnyValue),
            normalizedImportance,
            normalizedReports,
            pageSize,
            normalizedCursor,
            sortBy?.Trim().ToLowerInvariant() ?? "time",
            sortDirection?.Trim().ToLowerInvariant() ?? "desc");
        validationMessage = null;

        if (options.SortBy is not ("time" or "product" or "activity" or "status"))
        {
            validationMessage = "The 'sortBy' query parameter must be one of: time, product, activity, status.";
            return false;
        }

        if (options.SortDirection is not ("asc" or "desc"))
        {
            validationMessage = "The 'sortDirection' query parameter must be one of: asc, desc.";
            return false;
        }

        if (pageSize is <= 0 or > MaximumPageSize)
        {
            validationMessage = $"The 'pageSize' query parameter must be between 1 and {MaximumPageSize}.";
            return false;
        }

        if (normalizedCursor is not null && pageSize is null)
        {
            validationMessage = "The 'cursor' query parameter requires 'pageSize'.";
            return false;
        }

        if (!ImportanceValues.Contains(normalizedImportance))
        {
            validationMessage = "The 'importance' query parameter must be one of: all, important, failed.";
            return false;
        }

        if (!ReportValues.Contains(normalizedReports))
        {
            validationMessage = "The 'reports' query parameter must be one of: all, any, ic-enc, internal-validation.";
            return false;
        }

        if (normalizedCursor is not null && !DashboardQueryProcessor.IsValidCursor(normalizedCursor))
        {
            validationMessage = "The 'cursor' query parameter is invalid.";
            return false;
        }

        if (normalizedCursor is not null && !DashboardQueryProcessor.CursorMatchesSort(normalizedCursor, options))
        {
            validationMessage = "The 'cursor' query parameter does not match the requested sort.";
            return false;
        }

        return true;
    }

    private static string NormalizeToken(string? value, string fallback) =>
        NormalizeOptionalText(value)?.ToLowerInvariant() ?? fallback;

    private static string? NormalizeOptionalText(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }
}

public sealed record DashboardQueryResult(
    IReadOnlyList<DashboardActivityResponse> FilteredActivities,
    IReadOnlyList<DashboardActivityResponse> PageActivities,
    DashboardPagingResponse Paging,
    DashboardFilterOptionsResponse FilterOptions);

public static class DashboardQueryProcessor
{
    public static bool IsValidCursor(string value) =>
        DashboardCursor.TryParse(value, out _);

    public static bool CursorMatchesSort(string value, DashboardQueryOptions options) =>
        DashboardCursor.TryParse(value, out var cursor)
        && cursor!.SortBy == options.SortBy
        && cursor.SortDirection == options.SortDirection;

    private static readonly HashSet<string> FailedStatuses =
        new(StringComparer.OrdinalIgnoreCase) { "failed", "error", "rejected" };

    private static readonly HashSet<string> ImportantSeverities =
        new(StringComparer.OrdinalIgnoreCase) { "important", "critical", "warning" };

    public static DashboardQueryResult Execute(
        IEnumerable<DashboardActivityResponse> sourceActivities,
        DashboardQueryOptions options)
    {
        ArgumentNullException.ThrowIfNull(sourceActivities);
        ArgumentNullException.ThrowIfNull(options);

        var source = sourceActivities.ToArray();
        var filterOptions = CreateFilterOptions(source);
        var filtered = source
            .Where(activity => Matches(activity, options))
            .OrderBy(activity => activity, Comparer<DashboardActivityResponse>.Create((left, right) =>
                ComparePosition(left, GetPrimaryValue(right, options.SortBy),
                    right.Timestamp.UtcDateTime.Ticks, right.Id, options)))
            .ToArray();

        var afterCursor = ApplyCursor(filtered, options);
        var page = options.PageSize is int pageSize
            ? afterCursor.Take(pageSize).ToArray()
            : afterCursor.ToArray();
        var hasMore = options.PageSize is int requestedPageSize && afterCursor.Count > requestedPageSize;
        var nextCursor = hasMore && page.Length > 0
            ? DashboardCursor.Create(page[^1], options)
            : null;

        return new DashboardQueryResult(
            filtered,
            page,
            new DashboardPagingResponse
            {
                PageSize = options.PageSize,
                Returned = page.Length,
                Total = filtered.Length,
                HasMore = hasMore,
                NextCursor = nextCursor
            },
            filterOptions);
    }

    public static DashboardResponse CreateResponse(
        DateTimeOffset from,
        DateTimeOffset to,
        DateTimeOffset generatedAt,
        DashboardQueryResult result,
        string timeZone = "Europe/Copenhagen")
    {
        ArgumentNullException.ThrowIfNull(result);
        var activities = result.FilteredActivities;

        return new DashboardResponse
        {
            GeneratedAt = generatedAt,
            Range = new DashboardRangeResponse
            {
                From = from,
                To = to,
                TimeZone = timeZone
            },
            Summary = new DashboardSummaryResponse
            {
                TotalActivities = activities.Count,
                ProductsTouched = activities
                    .Select(activity => activity.DatasetName)
                    .Where(name => !string.IsNullOrWhiteSpace(name))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .Count(),
                ImportantChanges = activities.Count(IsImportant),
                FailedOperations = activities.Count(activity =>
                    FailedStatuses.Contains(activity.Status)),
                ReportsAvailable = activities.Sum(activity =>
                    activity.Links.IcEncReports.Count
                    + activity.Links.InternalValidationReports.Count)
            },
            StatusSummary = [
                .. activities
                    .GroupBy(activity => activity.Status, StringComparer.OrdinalIgnoreCase)
                    .OrderBy(group => GetStatusSortOrder(group.Key))
                    .ThenBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
                    .Select(group => new DashboardStatusSummaryItemResponse
                    {
                        Status = group.Key,
                        Count = group.Count()
                    })
            ],
            OperationSummary = [
                .. activities
                    .GroupBy(activity => activity.Type, StringComparer.OrdinalIgnoreCase)
                    .OrderBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
                    .Select(group => new DashboardOperationSummaryItemResponse
                    {
                        Type = group.Key,
                        Count = group.Count(),
                        Failed = group.Count(activity => FailedStatuses.Contains(activity.Status))
                    })
            ],
            Paging = result.Paging,
            FilterOptions = result.FilterOptions,
            Activities = [.. result.PageActivities]
        };
    }

    private static IReadOnlyList<DashboardActivityResponse> ApplyCursor(
        IReadOnlyList<DashboardActivityResponse> activities,
        DashboardQueryOptions options)
    {
        if (options.Cursor is null)
        {
            return activities;
        }

        if (!DashboardCursor.TryParse(options.Cursor, out var cursor)
            || !CursorMatchesSort(options.Cursor, options))
        {
            throw new ArgumentException("Invalid Dashboard cursor or sort mismatch.", nameof(options));
        }

        return activities.Where(activity => ComparePosition(activity, cursor!.PrimaryValue,
            cursor.TimestampUtcTicks, cursor.ActivityId, options) > 0).ToArray();
    }

    // Ordering and cursor continuation share one comparison to keep tie-breaks identical.
    private static int ComparePosition(
        DashboardActivityResponse activity, string primaryValue, long timestampUtcTicks,
        string activityId, DashboardQueryOptions options)
    {
        var primaryComparison = options.SortBy == "time"
            ? activity.Timestamp.UtcDateTime.Ticks.CompareTo(timestampUtcTicks)
            : StringComparer.OrdinalIgnoreCase.Compare(GetPrimaryValue(activity, options.SortBy), primaryValue);
        if (primaryComparison != 0)
        {
            return options.SortDirection == "asc" ? primaryComparison : -primaryComparison;
        }

        var timestampComparison = timestampUtcTicks.CompareTo(activity.Timestamp.UtcDateTime.Ticks);
        return timestampComparison != 0
            ? timestampComparison
            : StringComparer.Ordinal.Compare(activityId, activity.Id);
    }

    private static string GetPrimaryValue(DashboardActivityResponse activity, string sortBy) =>
        sortBy switch
        {
            "product" => activity.DatasetName,
            "activity" => activity.Title,
            "status" => activity.Status,
            _ => string.Empty
        };

    private static bool Matches(DashboardActivityResponse activity, DashboardQueryOptions options)
    {
        if (!MatchesSearch(activity, options.Search))
        {
            return false;
        }

        if (!MatchesToken(activity.Type, options.Type)
            || !MatchesToken(activity.Status, options.Status)
            || !MatchesProduct(activity.DatasetName, options.Product))
        {
            return false;
        }

        if (!MatchesImportance(activity, options.Importance))
        {
            return false;
        }

        return MatchesReports(activity, options.Reports);
    }

    private static bool MatchesSearch(DashboardActivityResponse activity, string search)
    {
        if (string.IsNullOrWhiteSpace(search))
        {
            return true;
        }

        var text = string.Join(
            " ",
            activity.Timestamp.ToString("O", CultureInfo.InvariantCulture),
            activity.DatasetName,
            activity.ProductName,
            activity.Type,
            activity.Status,
            activity.Severity,
            activity.Title,
            activity.Description,
            activity.Actor,
            string.Join(" ", activity.Details.Select(detail => $"{detail.Label} {detail.Value}")));

        return text.Contains(search, StringComparison.OrdinalIgnoreCase);
    }

    private static bool MatchesToken(string value, string filter) =>
        filter == DashboardQueryOptions.AnyValue
        || string.Equals(value, filter, StringComparison.OrdinalIgnoreCase);

    private static bool MatchesProduct(string value, string filter) =>
        filter == DashboardQueryOptions.AnyValue
        || string.Equals(value, filter, StringComparison.OrdinalIgnoreCase);

    private static bool MatchesImportance(DashboardActivityResponse activity, string filter)
    {
        if (filter == "failed")
        {
            return FailedStatuses.Contains(activity.Status);
        }

        if (filter == "important")
        {
            return IsImportant(activity);
        }

        return true;
    }

    private static bool MatchesReports(DashboardActivityResponse activity, string filter)
    {
        var hasIcEncReports = activity.Links.IcEncReports.Count > 0;
        var hasInternalValidationReports = activity.Links.InternalValidationReports.Count > 0;

        return filter switch
        {
            "any" => hasIcEncReports || hasInternalValidationReports,
            "ic-enc" => hasIcEncReports,
            "internal-validation" => hasInternalValidationReports,
            _ => true
        };
    }

    private static int GetStatusSortOrder(string status) =>
        status.ToLowerInvariant() switch
        {
            "failed" => 0,
            "active" => 1,
            "completed" => 2,
            "idle" => 3,
            _ => 4
        };

    private static bool IsImportant(DashboardActivityResponse activity) =>
        ImportantSeverities.Contains(activity.Severity)
        || FailedStatuses.Contains(activity.Status);

    private static DashboardFilterOptionsResponse CreateFilterOptions(
        IReadOnlyCollection<DashboardActivityResponse> activities) =>
        new()
        {
            Types = activities
                .Select(activity => activity.Type)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .Select(value => CreateTokenOption(value))
                .ToList(),
            Statuses = activities
                .Select(activity => activity.Status)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .Select(value => CreateTokenOption(value))
                .ToList(),
            Products = activities
                .Select(activity => activity.DatasetName)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .Select(value => new DashboardFilterOptionResponse { Value = value, Label = value })
                .ToList()
        };

    private static DashboardFilterOptionResponse CreateTokenOption(string value) =>
        new()
        {
            Value = value.ToLowerInvariant(),
            Label = string.Join(
                " ",
                value.Split(['-', '_', ' '], StringSplitOptions.RemoveEmptyEntries)
                    .Select(part => CultureInfo.InvariantCulture.TextInfo.ToTitleCase(part.ToLowerInvariant())))
        };

    private sealed record DashboardCursor(
        long TimestampUtcTicks, string ActivityId, string SortBy = "time",
        string SortDirection = "desc", string PrimaryValue = "")
    {
        public static string Create(DashboardActivityResponse activity, DashboardQueryOptions options)
        {
            var primary = Convert.ToBase64String(Encoding.UTF8.GetBytes(GetPrimaryValue(activity, options.SortBy)));
            var value = $"v1|{options.SortBy}|{options.SortDirection}|{activity.Timestamp.UtcDateTime.Ticks.ToString(CultureInfo.InvariantCulture)}|{primary}|{activity.Id}";
            return Convert.ToBase64String(Encoding.UTF8.GetBytes(value))
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }

        public static bool TryParse(string value, out DashboardCursor? cursor)
        {
            cursor = null;

            try
            {
                var normalized = value.Replace('-', '+').Replace('_', '/');
                normalized = normalized.PadRight(normalized.Length + ((4 - normalized.Length % 4) % 4), '=');
                var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(normalized));
                if (decoded.StartsWith("v1|", StringComparison.Ordinal))
                {
                    var parts = decoded.Split('|', 6);
                    if (parts.Length != 6
                        || parts[1] is not ("time" or "product" or "activity" or "status")
                        || parts[2] is not ("asc" or "desc")
                        || !long.TryParse(parts[3], NumberStyles.None, CultureInfo.InvariantCulture, out var versionedTicks)
                        || versionedTicks <= 0 || versionedTicks > DateTime.MaxValue.Ticks
                        || string.IsNullOrWhiteSpace(parts[5]))
                    {
                        return false;
                    }

                    var primary = Encoding.UTF8.GetString(Convert.FromBase64String(parts[4]));
                    if (parts[1] == "time" && primary.Length != 0)
                    {
                        return false;
                    }

                    cursor = new DashboardCursor(versionedTicks, parts[5], parts[1], parts[2], primary);
                    return true;
                }

                // Pre-FI-010 cursors always represent time descending.
                var separatorIndex = decoded.IndexOf('|');

                if (separatorIndex <= 0 || separatorIndex == decoded.Length - 1)
                {
                    return false;
                }

                if (!long.TryParse(
                    decoded.AsSpan(0, separatorIndex),
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var ticks))
                {
                    return false;
                }

                var activityId = decoded[(separatorIndex + 1)..];
                if (ticks <= 0 || string.IsNullOrWhiteSpace(activityId))
                {
                    return false;
                }

                cursor = new DashboardCursor(ticks, activityId);
                return true;
            }
            catch (FormatException)
            {
                return false;
            }
        }
    }
}
