using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI;

public sealed class ExportJobMetadataClientFilterTests
{
    [Theory]
    [InlineData(ExportOperationType.ExportEdition, "S101")]
    [InlineData(ExportOperationType.ExportUpdate, "S57")]
    [InlineData(ExportOperationType.CancelExport, "S101")]
    [InlineData(ExportOperationType.Discard, "S57")]
    public void IndependentTargetMetadataIsAccepted(ExportOperationType operationType, string target) {
        var parameters = ExportJobMetadataClientFilter.CreateParameters(new ExportOperationJobRequest("101DK001", operationType, target, 4, 2, "correlation", DateTimeOffset.UtcNow));
        Assert.Equal(target, parameters[ExportJobParameterNames.ExportTarget]);
        Assert.Equal(operationType.ToString(), parameters[ExportJobParameterNames.OperationType]);
    }

    [Theory]
    [InlineData(ExportOperationType.ExportEdition, "S100")]
    [InlineData(ExportOperationType.ExportUpdate, null)]
    [InlineData(ExportOperationType.CancelExport, null)]
    [InlineData(ExportOperationType.Discard, null)]
    public void InvalidTargetMetadataIsRejected(ExportOperationType operationType, string? target) {
        var request = new ExportOperationJobRequest("101DK001", operationType, target, 4, 2, "correlation", DateTimeOffset.UtcNow);
        Assert.Throws<InvalidOperationException>(() => ExportJobMetadataClientFilter.CreateParameters(request));
    }
}
