using System.Globalization;

namespace ProductCatalogueAPI.Services.Dashboard;

/// <summary>Interprets dashboard date filters in Copenhagen and converts SQL timestamps for display.</summary>
internal static class DashboardTime
{
    internal const string DashboardTimeZoneId = "Europe/Copenhagen";
    private static readonly Lazy<TimeZoneInfo> DashboardTimeZone = new(ResolveDashboardTimeZone);

    /// <summary>Resolves the public date range and its equivalent half-open UTC query bounds.</summary>
    /// <param name="from">Required inclusive start in local date, local time, or ISO offset form.</param>
    /// <param name="to">Optional end. A calendar date includes the whole day.</param>
    /// <param name="fromDanishTime">Resolved start in Copenhagen.</param>
    /// <param name="toDanishTime">Resolved end in Copenhagen.</param>
    /// <param name="fromDatabaseTime">Inclusive UTC start for the SQL query.</param>
    /// <param name="toDatabaseTime">Exclusive UTC end for the SQL query.</param>
    /// <param name="validationMessage">Public error when the range cannot be used.</param>
    /// <returns>True when both bounds resolve and the end follows the start.</returns>
    internal static bool TryCreateDashboardRange(
        string? from,
        string? to,
        out DateTimeOffset fromDanishTime,
        out DateTimeOffset toDanishTime,
        out DateTime fromDatabaseTime,
        out DateTime toDatabaseTime,
        out string? validationMessage)
    {
        fromDanishTime = default;
        toDanishTime = default;
        fromDatabaseTime = default;
        toDatabaseTime = default;
        validationMessage = null;

        if (string.IsNullOrWhiteSpace(from))
        {
            validationMessage = "The 'from' query parameter is required.";
            return false;
        }

        if (!TryParseDashboardDate(from, isRangeEnd: false, out fromDanishTime, out validationMessage))
        {
            return false;
        }

        if (string.IsNullOrWhiteSpace(to))
        {
            toDanishTime = GetDashboardNow();
        }
        else if (!TryParseDashboardDate(to, isRangeEnd: true, out toDanishTime, out validationMessage))
        {
            return false;
        }

        // ProductStateHistory stores UTC instants; Copenhagen conversion is an API-boundary concern.
        // The API boundary remains Danish time, while the repository boundary uses the persisted instant for correct filtering.
        fromDatabaseTime = fromDanishTime.UtcDateTime;
        toDatabaseTime = toDanishTime.UtcDateTime;

        if (toDatabaseTime <= fromDatabaseTime)
        {
            validationMessage = "The 'to' query parameter must be later than 'from'.";
            return false;
        }

        return true;
    }

    private static bool TryParseDashboardDate(
        string value,
        bool isRangeEnd,
        out DateTimeOffset danishValue,
        out string? validationMessage)
    {
        var trimmedValue = value.Trim();
        danishValue = default;
        validationMessage = null;

        if (DateOnly.TryParseExact(
            trimmedValue,
            "yyyy-MM-dd",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out var dateOnly))
        {
            var localDateTime = dateOnly.ToDateTime(TimeOnly.MinValue);

            if (isRangeEnd)
            {
                localDateTime = localDateTime.AddDays(1);
            }

            return TryCreateDanishDateTimeOffset(localDateTime, value, out danishValue, out validationMessage);
        }

        if (HasExplicitTimeZoneOffset(trimmedValue))
        {
            if (DateTimeOffset.TryParse(
                trimmedValue,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out var dateTimeOffset))
            {
                danishValue = TimeZoneInfo.ConvertTime(dateTimeOffset, DashboardTimeZone.Value);
                return true;
            }

            validationMessage = $"The date value '{value}' is invalid. Use yyyy-MM-dd, a Danish local date-time, or an ISO 8601 date-time with offset.";
            return false;
        }

        if (DateTime.TryParse(
            trimmedValue,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AllowWhiteSpaces,
            out var localDateTimeValue))
        {
            return TryCreateDanishDateTimeOffset(localDateTimeValue, value, out danishValue, out validationMessage);
        }

        validationMessage = $"The date value '{value}' is invalid. Use yyyy-MM-dd, a Danish local date-time, or an ISO 8601 date-time with offset.";
        return false;
    }

    private static bool TryCreateDanishDateTimeOffset(
        DateTime localDateTime,
        string originalValue,
        out DateTimeOffset danishValue,
        out string? validationMessage)
    {
        var unspecifiedLocalTime = DateTime.SpecifyKind(localDateTime, DateTimeKind.Unspecified);
        var timeZone = DashboardTimeZone.Value;
        danishValue = default;
        validationMessage = null;

        if (timeZone.IsInvalidTime(unspecifiedLocalTime))
        {
            validationMessage = $"The date value '{originalValue}' does not exist in {DashboardTimeZoneId} because of daylight saving time.";
            return false;
        }

        danishValue = new DateTimeOffset(unspecifiedLocalTime, timeZone.GetUtcOffset(unspecifiedLocalTime));
        return true;
    }

    internal static DateTimeOffset ConvertDatabaseTimeToDashboardTime(DateTime databaseDateTime)
    {
        var utcDateTime = TreatDatabaseTimeAsUtc(databaseDateTime);
        return TimeZoneInfo.ConvertTime(new DateTimeOffset(utcDateTime), DashboardTimeZone.Value);
    }

    internal static DateTime TreatDatabaseTimeAsUtc(DateTime dateTime)
    {
        return dateTime.Kind switch
        {
            DateTimeKind.Utc => dateTime,
            DateTimeKind.Local => dateTime.ToUniversalTime(),
            _ => DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
        };
    }

    internal static DateTimeOffset GetDashboardNow()
    {
        return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, DashboardTimeZone.Value);
    }

    private static TimeZoneInfo ResolveDashboardTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(DashboardTimeZoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time");
        }
        catch (InvalidTimeZoneException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time");
        }
    }

    private static bool HasExplicitTimeZoneOffset(string value)
    {
        if (value.EndsWith("Z", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var timeSeparatorIndex = value.IndexOf('T');

        if (timeSeparatorIndex < 0)
        {
            timeSeparatorIndex = value.IndexOf(' ');
        }

        if (timeSeparatorIndex < 0)
        {
            return false;
        }

        return HasOffsetSuffix(value, suffixLength: 6) || HasOffsetSuffix(value, suffixLength: 5);
    }

    private static bool HasOffsetSuffix(string value, int suffixLength)
    {
        if (value.Length < suffixLength)
        {
            return false;
        }

        var signIndex = value.Length - suffixLength;
        var sign = value[signIndex];

        if (sign is not ('+' or '-'))
        {
            return false;
        }

        if (suffixLength == 6)
        {
            return char.IsDigit(value[signIndex + 1])
                && char.IsDigit(value[signIndex + 2])
                && value[signIndex + 3] == ':'
                && char.IsDigit(value[signIndex + 4])
                && char.IsDigit(value[signIndex + 5]);
        }

        return char.IsDigit(value[signIndex + 1])
            && char.IsDigit(value[signIndex + 2])
            && char.IsDigit(value[signIndex + 3])
            && char.IsDigit(value[signIndex + 4]);
    }
}
