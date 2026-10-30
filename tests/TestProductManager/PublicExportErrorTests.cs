using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Models;

namespace TestProductCatalogueAPI;

public sealed class PublicExportErrorTests
{
    [Theory]
    [InlineData("ENC_SOURCE_SNAPSHOT_FAILED")]
    [InlineData("InvalidDataException")]
    [InlineData("ENC_EXPORT_INTERRUPTED")]
    [InlineData(null)]
    public void TechnicalMessagesFromOldTrackHistoryCannotReachProductResponses(string? code) {
        const string detail = "SevenCs: internal error at C:\\secret\\mapping.yaml, server=private";
        var track = new ProductExportTrackRecord { State = ProductState.Error, ErrorCode = code, ErrorMessage = detail };
        Assert.Equal(PublicExportError.GenericMessage, PublicExportError.For(track));
        Assert.Equal(detail, track.ErrorMessage); // The stored diagnostic/history is not rewritten.
        Assert.Equal(PublicExportError.GenericMessage, EncPackageStatusResolver.GetErrorMessage(null, null, track));
    }

    [Theory]
    [InlineData("SEVENCS_VALIDATION_FAILED")]
    [InlineData("SEVENCS_VALIDATION_UNAVAILABLE")]
    public void SevenCsMessagesRemainAvailable(string code) {
        var track = new ProductExportTrackRecord { State = ProductState.Error, ErrorCode = code, ErrorMessage = "SevenCs found 2 critical findings." };
        Assert.Equal(track.ErrorMessage, PublicExportError.For(track));
        Assert.Equal(track.ErrorMessage, EncPackageStatusResolver.GetErrorMessage(null, null, track));
    }

    [Fact]
    public void ReplacementFailureOnAReadyTrackAndAnOldPackageErrorAreSanitized() {
        var track = new ProductExportTrackRecord { State = ProductState.ReadyForDistribution, ErrorCode = "ENC_SOURCE_SNAPSHOT_FAILED", ErrorMessage = "Metadata S123 is invalid" };
        Assert.Equal(PublicExportError.GenericMessage, PublicExportError.For(track));
        Assert.Equal(PublicExportError.GenericMessage, EncPackageStatusResolver.GetErrorMessage(new EncPackage { ErrorMessage = "Invalid topology: path/private" }, null, null));
    }
}
