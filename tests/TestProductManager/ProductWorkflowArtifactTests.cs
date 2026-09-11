using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;

namespace TestProductCatalogueAPI;

public sealed class ProductWorkflowArtifactTests
{
    [Fact]
    public async Task CurrentValidationArtifactsAreScopedToTheLatestRevisionWhileHistoryRetainsEarlierRevisions()
    {
        var repository = new InMemoryProductRepository();
        var track = await repository.GetOrCreateTrackAsync(
            "101DK0000001E",
            ProductSpecification.S101,
            ExportEngineKind.IsoIec8211,
            publishedEdition: 4,
            publishedUpdate: 0);
        var firstCreatedAt = new DateTime(2026, 9, 11, 8, 0, 0, DateTimeKind.Utc);
        var firstRevisionId = await repository.AddRevisionAsync(new ProductRevisionWrite(
            track.Id,
            ExportRevisionType.NewEdition,
            Edition: 5,
            Update: 0,
            DatasetYaml: "first",
            ChangeSummaryYaml: null,
            CreatedBy: "test",
            CreatedAtUtc: firstCreatedAt));
        var secondRevisionId = await repository.AddRevisionAsync(new ProductRevisionWrite(
            track.Id,
            ExportRevisionType.Update,
            Edition: 5,
            Update: 1,
            DatasetYaml: "second",
            ChangeSummaryYaml: null,
            CreatedBy: "test",
            CreatedAtUtc: firstCreatedAt.AddMinutes(1)));

        await repository.AddArtifactAsync(new ProductArtifactWrite(
            track.Id,
            firstRevisionId,
            ProductArtifactKind.ValidationReport,
            "first-report.xml",
            "application/xml",
            "first"u8.ToArray(),
            firstCreatedAt));
        await repository.AddArtifactAsync(new ProductArtifactWrite(
            track.Id,
            secondRevisionId,
            ProductArtifactKind.ValidationDiagnostic,
            "second-diagnostic.vld",
            "text/plain",
            "second"u8.ToArray(),
            firstCreatedAt.AddMinutes(1)));
        await repository.AddArtifactAsync(new ProductArtifactWrite(
            track.Id,
            secondRevisionId,
            ProductArtifactKind.DatasetYaml,
            "second.yaml",
            "application/yaml",
            "second-yaml"u8.ToArray(),
            firstCreatedAt.AddMinutes(1)));

        var latestRevisionId = await repository.GetLatestRevisionIdAsync(track.Id);
        var currentArtifacts = await repository.GetValidationArtifactsAsync(latestRevisionId!.Value);
        var history = await repository.GetValidationArtifactHistoryAsync(track.Id);

        Assert.Equal(secondRevisionId, latestRevisionId);
        var currentArtifact = Assert.Single(currentArtifacts);
        Assert.Equal(secondRevisionId, currentArtifact.RevisionId);
        Assert.Equal("second-diagnostic.vld", currentArtifact.FileName);
        Assert.Equal(2, history.Count);
        Assert.Equal(
            new[] { "second-diagnostic.vld", "first-report.xml" },
            history.Select(artifact => artifact.FileName));
        Assert.All(history, artifact => Assert.NotNull(artifact.RevisionId));
    }
}
