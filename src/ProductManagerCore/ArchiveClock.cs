namespace S100FC.ProductCatalogue;

/// <summary>Separates SQL archive wall time from the clock of offset-free values returned by ArcGIS.</summary>
internal sealed class ArchiveClock(TimeZoneInfo storageTimeZone, TimeZoneInfo unspecifiedValueTimeZone)
{
    /// <summary>The timezone of datetime values physically stored in the archive columns.</summary>
    internal TimeZoneInfo StorageTimeZone { get; } = storageTimeZone;

    /// <summary>The timezone used only when the SDK returns a DateTime without a Kind.</summary>
    internal TimeZoneInfo UnspecifiedValueTimeZone { get; } = unspecifiedValueTimeZone;

    /// <summary>Loads independent clock settings; Copenhagen is the verified clock of this installation.</summary>
    internal static ArchiveClock FromEnvironment() => new(
        ResolveTimeZone(Environment.GetEnvironmentVariable("S101_ARCHIVE_STORAGE_TIME_ZONE") ?? "Europe/Copenhagen"),
        ResolveTimeZone(Environment.GetEnvironmentVariable("S101_ARCHIVE_UNSPECIFIED_TIME_ZONE") ?? "Europe/Copenhagen"));

    /// <summary>Resolves the production IANA name on both Windows and Unix hosts.</summary>
    internal static TimeZoneInfo ResolveTimeZone(string name) {
        try { return TimeZoneInfo.FindSystemTimeZoneById(name); }
        catch (TimeZoneNotFoundException) when (name.Equals("Europe/Copenhagen", StringComparison.OrdinalIgnoreCase)) {
            return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time");
        }
    }

    /// <summary>Converts a UTC cursor to a conservative SQL literal in the archive's storage clock.</summary>
    internal DateTime ToQueryLowerBound(ArchiveScanWindow window) {
        var local = TimeZoneInfo.ConvertTimeFromUtc(window.SinceUtc, StorageTimeZone);
        var localEnd = TimeZoneInfo.ConvertTimeFromUtc(window.ThroughUtc, StorageTimeZone);
        if (StorageTimeZone.IsAmbiguousTime(local) || StorageTimeZone.IsAmbiguousTime(localEnd))
            throw new InvalidOperationException($"Archive scan boundary falls in the repeated DST hour of '{StorageTimeZone.Id}'. Offset-free archive times cannot identify the intended instant; the watermark was preserved.");

        // SQLSyntax.Format may omit fractions. Floor first and apply the exact UTC boundary
        // after reading both dates, so precision loss cannot skip an archive version.
        return new DateTime(local.Ticks - local.Ticks % TimeSpan.TicksPerSecond, DateTimeKind.Unspecified);
    }

    /// <summary>Builds the shared lower-bound predicate, excluding open-ended rows from the close-date arm.</summary>
    internal static string CreateEventPredicate(string sinceLiteral, string openEndLiteral) =>
        $"(GDB_FROM_DATE > {sinceLiteral} OR (GDB_TO_DATE > {sinceLiteral} AND GDB_TO_DATE < {openEndLiteral}))";

    /// <summary>Detects a disagreement between SQL selection and normalized values beyond permitted fractional rounding.</summary>
    internal void VerifyQueryCandidate(ArchiveInterval interval, ArchiveScanWindow window) {
        var latest = interval.ToUtc.HasValue && interval.ToUtc.Value > interval.FromUtc ? interval.ToUtc.Value : interval.FromUtc;
        if (latest < window.SinceUtc.AddSeconds(-1))
            throw new InvalidOperationException($"Archive SQL returned a version older than its cutoff after normalization. FromUtc: {interval.FromUtc:O}. ToUtc: {interval.ToUtc:O}. SinceUtc: {window.SinceUtc:O}. StorageZone: {StorageTimeZone.Id}. UnspecifiedValueZone: {UnspecifiedValueTimeZone.Id}. Inspect the raw dates and SQL literal; the watermark was preserved.");
    }

    /// <summary>Preserves explicit instants and deliberately interprets only offset-free SDK values.</summary>
    internal DateTime? ReadUtc(object? value) => value switch {
        null or DBNull => null,
        DateTimeOffset offset => offset.UtcDateTime,
        DateTime { Kind: DateTimeKind.Utc } date => date,
        DateTime { Kind: DateTimeKind.Local } date => date.ToUniversalTime(),
        DateTime date => ReadWallTimeUtc(date),
        _ => throw new InvalidOperationException($"Unsupported archive timestamp type '{value.GetType().FullName}'.")
    };

    /// <summary>Reads a version interval and validates finite dates against the current worker clock.</summary>
    internal ArchiveInterval ReadInterval(object? fromValue, object? toValue, DateTime observedAtUtc) {
        ArchiveScanWindow.RequireUtc(observedAtUtc, nameof(observedAtUtc));
        var from = ReadUtc(fromValue) ?? throw new InvalidOperationException("An archive version has no GDB_FROM_DATE; the watermark was preserved.");
        DateTime? to = toValue switch {
            DateTime { Year: 9999 } => null,
            DateTimeOffset { Year: 9999 } => null,
            null or DBNull => throw new InvalidOperationException("An archive version has no GDB_TO_DATE; the watermark was preserved."),
            _ => ReadUtc(toValue)
        };
        if (to.HasValue && to.Value < from)
            throw new InvalidOperationException("An archive version ends before it starts; check the archive clock settings. The watermark was preserved.");
        if (from > observedAtUtc.AddMinutes(5) || to > observedAtUtc.AddMinutes(5))
            throw new InvalidOperationException($"Archive version has a genuine future timestamp. FromUtc: {from:O}. ToUtc: {to:O}. WorkerUtc: {observedAtUtc:O}. Check clock synchronization and archive timezone settings; the watermark was preserved.");
        return new ArchiveInterval(from, to);
    }

    private DateTime ReadWallTimeUtc(DateTime date) {
        if (UnspecifiedValueTimeZone.IsInvalidTime(date) || UnspecifiedValueTimeZone.IsAmbiguousTime(date))
            throw new InvalidOperationException($"Archive date '{date:O}' is invalid or ambiguous in '{UnspecifiedValueTimeZone.Id}'. Supply the actual UTC/offset value; the watermark was preserved.");
        return TimeZoneInfo.ConvertTimeToUtc(date, UnspecifiedValueTimeZone);
    }
}

/// <summary>Describes when an archived version existed; a null end means the ArcGIS year-9999 sentinel.</summary>
internal readonly record struct ArchiveInterval(DateTime FromUtc, DateTime? ToUtc)
{
    /// <summary>Tests the half-open lifetime of this version at a UTC snapshot boundary.</summary>
    internal bool Contains(DateTime instantUtc) => FromUtc <= instantUtc && (!ToUtc.HasValue || ToUtc.Value > instantUtc);

    /// <summary>Returns the newest creation or closure event inside this scan, excluding later concurrent edits.</summary>
    internal DateTime? LatestEvent(ArchiveScanWindow window) {
        DateTime? latest = window.Contains(FromUtc) ? FromUtc : null;
        if (ToUtc.HasValue && window.Contains(ToUtc.Value) && (!latest.HasValue || ToUtc.Value > latest.Value))
            latest = ToUtc;
        return latest;
    }
}

/// <summary>Uses one exclusive lower bound and inclusive upper bound for the entire DPC invocation.</summary>
internal readonly record struct ArchiveScanWindow
{
    /// <summary>Creates a window from actual UTC instants; persisted datetime2 values must be tagged at their repository boundary.</summary>
    internal ArchiveScanWindow(DateTime sinceUtc, DateTime throughUtc) {
        RequireUtc(sinceUtc, nameof(sinceUtc));
        RequireUtc(throughUtc, nameof(throughUtc));
        if (sinceUtc > throughUtc)
            throw new InvalidOperationException($"Archive watermark {sinceUtc:O} is after scan boundary {throughUtc:O}; inspect JobRunState before continuing.");
        SinceUtc = sinceUtc;
        ThroughUtc = throughUtc;
    }

    /// <summary>The last successfully consumed UTC instant.</summary>
    internal DateTime SinceUtc { get; }
    /// <summary>The current invocation's fixed UTC cutoff.</summary>
    internal DateTime ThroughUtc { get; }
    /// <summary>Returns whether an event belongs to this scan rather than its predecessor or successor.</summary>
    internal bool Contains(DateTime instantUtc) => instantUtc > SinceUtc && instantUtc <= ThroughUtc;

    /// <summary>Chooses the endpoint states and newest in-window event independently of archive cursor order.</summary>
    internal ArchiveEndpoints<T> Compose<T>(IEnumerable<T> versions, Func<T, ArchiveInterval> interval) where T : class {
        var window = this;
        var observed = versions.Where(version => interval(version).LatestEvent(window).HasValue).ToArray();
        if (observed.Length == 0)
            throw new InvalidOperationException("An archive change has no event in the requested scan window.");
        var before = observed.Where(version => interval(version).Contains(window.SinceUtc))
            .OrderByDescending(version => interval(version).FromUtc).FirstOrDefault();
        var after = observed.Where(version => interval(version).Contains(window.ThroughUtc))
            .OrderByDescending(version => interval(version).FromUtc).FirstOrDefault();
        var latest = observed.OrderByDescending(version => interval(version).LatestEvent(window)).First();
        return new ArchiveEndpoints<T>(before, after, latest, interval(latest).LatestEvent(window)!.Value);
    }

    /// <summary>Rejects unspecified times instead of silently treating archive wall time as UTC.</summary>
    internal static void RequireUtc(DateTime value, string name) {
        if (value.Kind != DateTimeKind.Utc)
            throw new ArgumentException("An actual UTC instant is required.", name);
    }
}

/// <summary>The states to compare and the actual event timestamp to record in the summary.</summary>
internal sealed record ArchiveEndpoints<T>(T? Before, T? After, T Latest, DateTime LatestEditUtc) where T : class;
