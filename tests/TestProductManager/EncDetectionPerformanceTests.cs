using Microsoft.Extensions.Configuration;
using S100FC.ProductCatalogue;
using System.Diagnostics;

namespace TestProductCatalogueAPI;

public sealed class EncDetectionPerformanceTests
{
    [Theory]
    [InlineData("true", true)]
    [InlineData("TRUE", true)]
    [InlineData("  True  ", true)]
    [InlineData("1", true)]
    [InlineData("false", false)]
    [InlineData("0", false)]
    [InlineData("yes", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void ProfilingRequiresExplicitOptIn(string? value, bool expected)
    {
        Assert.Equal(expected, EncDetectionPerformance.IsEnabledValue(value));
    }

    [Fact]
    public void AppSettingsProfilingOverridesPriorValueAndDefaultsToDisabled()
    {
        var enabledSettings = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> {
                ["EncDetection:Performance:Enabled"] = "true"
            })
            .Build();
        var disabledSettings = new ConfigurationBuilder().Build();

        try
        {
            EncDetectionPerformance.Configure(enabledSettings[EncDetectionPerformance.ConfigurationKey]);
            Assert.True(EncDetectionPerformance.IsEnabled);

            EncDetectionPerformance.Configure(disabledSettings[EncDetectionPerformance.ConfigurationKey]);
            Assert.False(EncDetectionPerformance.IsEnabled);
        }
        finally
        {
            EncDetectionPerformance.Configure(null);
        }
    }

    [Fact]
    public void StageTimingIsDisjointWhileTableDetailsAreNested()
    {
        var events = new List<EncDetectionPhaseMetric>();
        var timestamp = 0L;
        var ticksPerMillisecond = Stopwatch.Frequency / 1000;
        var profiler = new EncDetectionPhaseProfiler(
            "101DK001GSOUT", 2, 0, 3, events.Add, () => timestamp);

        timestamp += ticksPerMillisecond * 15;
        profiler.Next("DataCoverage");
        timestamp += ticksPerMillisecond * 7;
        profiler.Next("FeatureTables", inputCount: 4);
        var tableStartedAt = profiler.Timestamp();
        timestamp += ticksPerMillisecond * 3;
        profiler.Detail("FeatureTable:curve", tableStartedAt, inputCount: 2, outputCount: 4);
        timestamp += ticksPerMillisecond * 17;
        profiler.Finish(success: true, inputCount: 2, outputCount: 4);
        profiler.Finish(success: false);

        Assert.Equal(4, events.Count);
        Assert.Equal("ArcGisQueueWait", events[0].Phase);
        Assert.Equal(15d, events[0].DurationMs, 3);
        Assert.Equal("DataCoverage", events[1].Phase);
        Assert.Equal(7d, events[1].DurationMs, 3);
        Assert.Equal(4, events[1].InputCount);
        Assert.Equal("FeatureTable:curve", events[2].Phase);
        Assert.True(events[2].IsDetail);
        Assert.Equal(3d, events[2].DurationMs, 3);
        Assert.Equal(4, events[2].OutputCount);
        Assert.Equal("FeatureTables", events[3].Phase);
        Assert.False(events[3].IsDetail);
        Assert.Equal(20d, events[3].DurationMs, 3);
        Assert.Equal(3, events[3].RequiredChangedFeatureCount);
        Assert.Equal("101DK001GSOUT", events[3].DatasetName);
        Assert.All(events, entry => Assert.True(entry.Success));
    }

    [Fact]
    public void FailedOrCancelledStageIsReportedOnceWithoutAFalseSuccess()
    {
        var events = new List<EncDetectionPhaseMetric>();
        var timestamp = 0L;
        var profiler = new EncDetectionPhaseProfiler(
            "101DK001OSTSO", 1, 0, 1, events.Add, () => timestamp);

        timestamp += Stopwatch.Frequency / 1000 * 5;
        profiler.Next("BuildTopology");
        timestamp += Stopwatch.Frequency / 1000 * 50;
        profiler.Finish(success: false);
        profiler.Finish(success: true);

        Assert.Equal(2, events.Count);
        Assert.True(events[0].Success);
        Assert.False(events[1].Success);
        Assert.Equal("BuildTopology", events[1].Phase);
        Assert.Equal(50d, events[1].DurationMs, 3);
        Assert.Equal(1, events[1].RequiredChangedFeatureCount);
    }
}
