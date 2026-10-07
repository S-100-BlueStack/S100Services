using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Jobs;
using S100FC;
using S100FC.YAML;
using S100FC.ProductCatalogue;

namespace TestProductCatalogueAPI;

public sealed class EncChangeSummaryArchiveClockTests
{
    [Fact]
    public void ArchivedEditOrderDoesNotDependOnTheWorkerClock() {
        var workerUtc = new DateTime(2026, 10, 6, 11, 1, 22, DateTimeKind.Utc);
        var archiveUtc = new DateTime(2026, 10, 6, 11, 24, 17, DateTimeKind.Utc);
        var featureId = Guid.Parse("b51808c6-3a80-4b4a-bcd2-09619e648c7c");
        var summary = EncChangeSummary.Serialize("101DK001NORSO", ProductSpecification.S101, new DateOnly(2026, 10, 6), workerUtc.AddMinutes(-1), workerUtc,
            [new ProductChange(featureId.ToString("B"), "LandArea", "attributes.featureName", archiveUtc, false)]);

        var recordedArchiveUtc = EncChangeSummary.GetLatestArchiveEditUtc(summary);
        Assert.Equal(archiveUtc, recordedArchiveUtc);
        Assert.Contains($"featureId: {featureId}", summary);
        //Assert.False(EncPackageDetectionService.HasNewEdits(new Dictionary<string, ArchiveRow> {
        //    ["feature-1"] = new() { EditDate = archiveUtc }
        //}, recordedArchiveUtc));
        //Assert.True(EncPackageDetectionService.HasNewEdits(new Dictionary<string, ArchiveRow> {
        //    ["feature-1"] = new() { EditDate = archiveUtc.AddSeconds(1) }
        //}, recordedArchiveUtc));
    }

    [Fact]
    public void ExistingPackageSummaryCanSupplyTheArchiveBaseline() {
        const string legacySummary = "firstDetectedAtUtc: 2026-10-06T11:01:22.0000000Z\nchanges:\n" +
            "  - featureId: \"feature-1\"\n    detectedAtUtc: 2026-10-06T11:24:17.0000000Z\n";

        Assert.Equal(new DateTime(2026, 10, 6, 11, 24, 17, DateTimeKind.Utc), EncChangeSummary.GetLatestArchiveEditUtc(legacySummary));
        Assert.Throws<InvalidOperationException>(() => EncChangeSummary.GetLatestArchiveEditUtc("changes:\n"));
    }

    [Fact]
    public void EmptyExtensionUidUsesArchivedGlobalIdOrStopsSafely() {
        var globalId = Guid.NewGuid();

        Assert.Equal(globalId.ToString("B"), ProductManagerGDB.ResolveFeatureId(Guid.Empty.ToString("B"), globalId));
        Assert.Throws<InvalidOperationException>(() => ProductManagerGDB.ResolveFeatureId(Guid.Empty.ToString("B"), Guid.Empty));
    }

    [Fact]
    public void SummaryContainsOnlyTheEditedDepthContourValueAndDeduplicatesPaths() {
        var row = new ArchiveRow {
            Code = "DepthContour", BeforeCode = "DepthContour",
            BeforeAttributeBindings = "{\"valueOfDepthContour\":10,\"quality\":{\"category\":1}}",
            AttributeBindings = "{\"quality\":{\"category\":1},\"valueOfDepthContour\":67}",
            BeforeFeatureBindings = "[{\"featureId\":\"a\",\"role\":\"same\"}]",
            FeatureBindings = "[{\"role\":\"same\",\"featureId\":\"a\"}]",
            BeforeInformationBindings = "[]", InformationBindings = "[]"
        };
        Assert.Equal(["attributes.valueOfDepthContour"], EncChangeSummary.GetObservedAttributePaths(row));
    }

    [Fact]
    public void AddedRemovedNestedValuesBindingsAndDeletionAreDistinguished() {
        var row = new ArchiveRow {
            Code = "DepthContour", BeforeCode = "DepthContour",
            BeforeAttributeBindings = "{\"nested\":{\"old\":null},\"items\":[1,2]}",
            AttributeBindings = "{\"nested\":{\"new\":null},\"items\":[1,3]}",
            BeforeFeatureBindings = "[]", FeatureBindings = "[{\"featureId\":\"a\"}]"
        };
        Assert.Equal(new[] { "attributes.items[1]", "attributes.nested.new", "attributes.nested.old", "featureBindings" }, EncChangeSummary.GetObservedAttributePaths(row));
        row.Deleted = true;
        Assert.Equal(["$deleted"], EncChangeSummary.GetObservedAttributePaths(row));
    }

    [Fact]
    public void RepeatedEditsUseTheFirstAndFinalStatesOnly() {
        // The archive composer supplies the state at the watermark and the newest state.
        var row = new ArchiveRow {
            Code = "DepthContour", BeforeCode = "DepthContour",
            BeforeAttributeBindings = "{\"valueOfDepthContour\":10}",
            AttributeBindings = "{\"valueOfDepthContour\":10}",
            BeforeFeatureBindings = "[]", FeatureBindings = "[]"
        };
        Assert.Empty(EncChangeSummary.GetObservedAttributePaths(row));
        row.AttributeBindings = "{\"valueOfDepthContour\":67}";
        Assert.Equal(["attributes.valueOfDepthContour"], EncChangeSummary.GetObservedAttributePaths(row));
    }
}
