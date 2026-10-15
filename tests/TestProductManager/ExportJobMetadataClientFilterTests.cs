using ProductCatalogueAPI.Jobs;
using ProductCatalogueAPI.Services.Operations;

namespace TestProductCatalogueAPI;

public sealed class ExportJobMetadataClientFilterTests
{
    [Fact]
    public void OperationIdentitySurvivesMetadataCreationAndDiffersFromCorrelation() {
        var operationId = Guid.NewGuid();
        var request = new ExportOperationJobRequest("101DK001", ExportOperationType.ExportEdition, "S101", 4, 2, "correlation", DateTimeOffset.UtcNow, operationId);
        var parameters = ExportJobMetadataClientFilter.CreateParameters(request);
        Assert.Equal(operationId, parameters[ExportJobParameterNames.OperationId]);
        Assert.Equal(operationId, ExportJobMetadataClientFilter.CreateParameters(request)[ExportJobParameterNames.OperationId]);
        Assert.Equal("correlation", parameters[ExportJobParameterNames.CorrelationId]);
    }

    [Fact]
    public void LegacyRequestGetsAnApplicationGeneratedOperationParameterAtCreation() {
        var request = new ExportOperationJobRequest("101DK001", ExportOperationType.ExportEdition, "S101", 4, 2, "correlation", DateTimeOffset.UtcNow);
        var operationId = Assert.IsType<Guid>(ExportJobMetadataClientFilter.CreateParameters(request)[ExportJobParameterNames.OperationId]);
        Assert.NotEqual(Guid.Empty, operationId);
    }

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
