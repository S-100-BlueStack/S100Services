using Serilog;
using System.Diagnostics;
using System.Threading;

namespace S100FC.ProductCatalogue;

/// <summary>Opt-in timing of ENC archive scans and source snapshot creation.</summary>
public static class EncDetectionPerformance
{
    public const string ConfigurationKey = "EncDetection:Performance:Enabled";

    private static int _enabled;

    public static bool IsEnabled => Volatile.Read(ref _enabled) == 1;

    /// <summary>Applies the Worker configuration for subsequent profiling calls.</summary>
    public static void Configure(string? configuredValue) =>
        Volatile.Write(ref _enabled, IsEnabledValue(configuredValue) ? 1 : 0);

    internal static bool IsEnabledValue(string? value) =>
        string.Equals(value?.Trim(), "true", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(value?.Trim(), "1", StringComparison.Ordinal);
}

internal sealed record EncDetectionPhaseMetric(
    string DatasetName,
    int Edition,
    int Update,
    int RequiredChangedFeatureCount,
    string Phase,
    double DurationMs,
    int InputCount,
    int OutputCount,
    bool Success,
    bool IsDetail);

/// <summary>Records disjoint top-level stages and optional nested details without changing the work performed.</summary>
internal sealed class EncDetectionPhaseProfiler
{
    private readonly string _datasetName;
    private readonly int _edition;
    private readonly int _update;
    private readonly int _requiredChangedFeatureCount;
    private readonly Action<EncDetectionPhaseMetric> _report;
    private readonly Func<long> _timestamp;
    private string _currentPhase = "ArcGisQueueWait";
    private long _phaseStartedAt;
    private bool _finished;

    internal EncDetectionPhaseProfiler(
        string datasetName,
        int edition,
        int update,
        int requiredChangedFeatureCount,
        Action<EncDetectionPhaseMetric> report,
        Func<long>? timestamp = null)
    {
        _datasetName = datasetName;
        _edition = edition;
        _update = update;
        _requiredChangedFeatureCount = requiredChangedFeatureCount;
        _report = report;
        _timestamp = timestamp ?? Stopwatch.GetTimestamp;
        _phaseStartedAt = _timestamp();
    }

    internal static EncDetectionPhaseProfiler? CreateIfEnabled(
        string datasetName,
        int edition,
        int update,
        int requiredChangedFeatureCount)
    {
        if (!EncDetectionPerformance.IsEnabled)
            return null;

        return new EncDetectionPhaseProfiler(datasetName, edition, update, requiredChangedFeatureCount, metric =>
            Log.Information(
                "ENC detection profile. DatasetName: {DatasetName}. Edition: {Edition}. Update: {Update}. RequiredChangedFeatureCount: {RequiredChangedFeatureCount}. Phase: {Phase}. Detail: {Detail}. DurationMs: {DurationMs}. InputCount: {InputCount}. OutputCount: {OutputCount}. Success: {Success}.",
                metric.DatasetName, metric.Edition, metric.Update, metric.RequiredChangedFeatureCount,
                metric.Phase, metric.IsDetail, metric.DurationMs, metric.InputCount, metric.OutputCount, metric.Success));
    }

    internal long Timestamp() => _timestamp();

    internal void Next(string nextPhase, int inputCount = 0, int outputCount = 0)
    {
        if (_finished)
            return;

        var now = _timestamp();
        Report(_currentPhase, _phaseStartedAt, now, inputCount, outputCount, true, false);
        _currentPhase = nextPhase;
        _phaseStartedAt = now;
    }

    /// <summary>Nested timing does not reset the parent stage's start or double count its duration.</summary>
    internal void Detail(string phase, long startedAt, int inputCount, int outputCount)
    {
        if (_finished)
            return;
        Report(phase, startedAt, _timestamp(), inputCount, outputCount, true, true);
    }

    internal void Finish(bool success, int inputCount = 0, int outputCount = 0)
    {
        if (_finished)
            return;
        _finished = true;
        Report(_currentPhase, _phaseStartedAt, _timestamp(), inputCount, outputCount, success, false);
    }

    private void Report(string phase, long startedAt, long finishedAt, int inputCount, int outputCount, bool success, bool isDetail)
    {
        _report(new EncDetectionPhaseMetric(
            _datasetName, _edition, _update, _requiredChangedFeatureCount, phase,
            Stopwatch.GetElapsedTime(startedAt, finishedAt).TotalMilliseconds,
            inputCount, outputCount, success, isDetail));
    }
}
