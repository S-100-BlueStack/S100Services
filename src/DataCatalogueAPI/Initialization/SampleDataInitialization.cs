using DataCatalague.Api.Controllers;
using DataCatalague.Api.Domain;
using DataCatalague.Api.PackageTypes;
using System.Text.Json;
using DataCatalague.Api.Models.V1;
using Microsoft.AspNetCore.Mvc;
using System.IO.Compression;

namespace DataCatalague.Api.Initialization;

/// <summary>Creates development data through the registered controllers after the in-memory stores are reset.</summary>
/// <param name="dispatcher">The dispatcher controller resolved from the host container.</param>
/// <param name="packages">The package controller resolved from the same container.</param>
/// <param name="logger">Receives sample initialization progress.</param>
public sealed class SampleDataInitialization(DispatcherController dispatcher, PackageController packages, ILogger<SampleDataInitialization> logger)
{
    /// <summary>Creates the core categories, their sample specifications and sample packages in the fresh development stores.</summary>
    /// <param name="cancellationToken">Cancels sample reading and controller operations.</param>
    /// <returns>A task that completes when all sample packages have been created.</returns>
    public async Task InitializeAsync(CancellationToken cancellationToken) {
        // Create Categories for the sample packages. These are required by the package controller to accept the sample packages.
        foreach (var category in new[] {
            (Id: "NoticeToMariners", Name: "Notices to Mariners", Prefix: "NM", Description: "Published navigation notices.", Specification: """
                # Notices to Mariners

                Development sample specification for published navigation notices.

                - Source: Niord notice JSON from `Samples/NoticesToMariners`.
                - Package identifier: the notice's `shortId`, including the year.
                - Source metadata and category-specific notice data are preserved on the package.
                - The AOI is the rectangular envelope of the detailed geometry.
                - Detailed geometry may contain points, curves and surfaces.
                """),
            (Id: "GeneralSubmission", Name: "General Submissions", Prefix: "GS", Description: "Unclassified submissions supplied as ZIP files containing a contract and AOI shapefile.", Specification: """
                # General Submissions

                Development sample specification for general submissions.

                - Source: ZIP archives from `Samples/GeneralSubmission`.
                - Package identifiers are allocated in `GS-NNN-YY` format.
                - Each sample contains `submission.json`, `contract.txt` and a complete AOI shapefile (`aoi.shp`, `aoi.shx`, `aoi.dbf`, `aoi.prj`).
                - The sample initializer reads the title, source and AOI from `submission.json`.
                - The manifest is preserved as category-specific package data.
                """)
        }) {
            var created = await dispatcher.CreateCategory(new CreateCategoryRequest {
                Id = category.Id,
                DisplayName = category.Name,
                Prefix = category.Prefix,
                Description = category.Description,
            }, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create category '{category.Id}'");

            var specificationUpdated = await dispatcher.UpdateCategorySpecification(category.Id, new UpdateCategorySpecificationRequest {
                Version = "1.0",
                Markdown = category.Specification,
            }, cancellationToken).ConfigureAwait(false);
            RequireSuccess(specificationUpdated, $"update specification for category '{category.Id}'");
        }


        // Create sample notice packages from the JSON files in the Samples/NoticesToMariners directory.
        var directory = Path.Combine(AppContext.BaseDirectory, "Samples", "NoticesToMariners");
        var files = Directory.GetFiles(directory, "*.json").Order(StringComparer.Ordinal).ToArray();
        if (files.Length == 0) { throw new InvalidDataException($"No notice samples found in '{directory}'."); }

        foreach (var file in files) {
            var request = CreateRequest(await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false), file);
            logger.LogInformation("Creating notice sample {FileName} as package {PackageId}.", Path.GetFileName(file), request.Id);
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create notice package '{request.Id}'");
        }




        // General submissions are ZIP-based; the manifest supplies the AOI until a real submission ingestion flow exists.
        var submissionDirectory = Path.Combine(AppContext.BaseDirectory, "Samples", "GeneralSubmission");
        var submissionFiles = Directory.GetFiles(submissionDirectory, "*.zip").Order(StringComparer.Ordinal).ToArray();
        if (submissionFiles.Length != 2) {
            throw new InvalidDataException($"Expected two general submission ZIP samples in '{submissionDirectory}', found {submissionFiles.Length}.");
        }

        foreach (var file in submissionFiles) {
            using var archive = ZipFile.OpenRead(file);
            var manifest = archive.GetEntry("submission.json") ?? throw new InvalidDataException($"Sample '{Path.GetFileName(file)}' has no submission.json.");
            if (archive.GetEntry("contract.txt") is null || archive.GetEntry("aoi.shp") is null || archive.GetEntry("aoi.shx") is null || archive.GetEntry("aoi.dbf") is null || archive.GetEntry("aoi.prj") is null) {
                throw new InvalidDataException($"Sample '{Path.GetFileName(file)}' must contain a contract and complete AOI shapefile.");
            }
            await using var stream = manifest.Open();
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken).ConfigureAwait(false);
            var data = document.RootElement;
            var title = data.GetProperty("title").GetString();
            var aoi = data.GetProperty("aoi").GetRawText();
            var request = new CreatePackageRequest {
                Category = "GeneralSubmission",
                AbsoluteUri = new Uri(Path.GetFullPath(file)).AbsoluteUri,
                EsriJSON = aoi,
                MetaData = new PackageMetaData(null, "GeneralSubmission", null, title, data.GetProperty("source").GetString(), null, DateTimeOffset.UtcNow),
                CategoryData = data.Clone()
            };
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create general submission '{Path.GetFileName(file)}'");
            logger.LogInformation("Created general submission sample {FileName}.", Path.GetFileName(file));
        }

        logger.LogInformation("Sample initialization completed. CreatedPackages: {CreatedPackages}.", files.Length + submissionFiles.Length);
    }

    private static CreatePackageRequest CreateRequest(string json, string sourceFile) {
        var notice = NoticeToMariners.Parse(json);
        if (string.IsNullOrWhiteSpace(notice.MetaData.ShortId)) {
            throw new InvalidDataException($"Notice sample '{Path.GetFileName(sourceFile)}' has no shortId.");
        }
        return new CreatePackageRequest {
            // Niords assigns the public notice ID; its UUID remains available separately in MetaData.RefId.
            Id = notice.MetaData.ShortId,
            Category = "NoticeToMariners",
            AbsoluteUri = new Uri(sourceFile).AbsoluteUri,
            EsriJSON = notice.Geometry.Aoi,
            DetailedGeometry = notice.Geometry,
            MetaData = notice.MetaData,
            CategoryData = JsonSerializer.SerializeToElement(notice.Data),
        };
    }

    private static T RequireSuccess<T>(ActionResult<T> response, string operation) {
        if (response.Value is { } value) { return value; }
        if (response.Result is ObjectResult { Value: T result } objectResult && objectResult.StatusCode is >= 200 and < 300) {
            return result;
        }
        var status = (response.Result as ObjectResult)?.StatusCode;
        throw new InvalidOperationException($"Could not {operation}; controller returned {status?.ToString() ?? response.Result?.GetType().Name ?? "no result"}.");
    }
}
