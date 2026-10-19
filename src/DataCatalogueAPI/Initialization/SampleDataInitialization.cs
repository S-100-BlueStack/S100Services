using DataCatalague.Api.Controllers;
using DataCatalague.Api.Domain;
using DataCatalague.Api.PackageTypes;
using System.Text.Json;
using DataCatalague.Api.Models.V1;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Initialization;

/// <summary>Creates development data through the registered controllers after the in-memory stores are reset.</summary>
/// <param name="dispatcher">The dispatcher controller resolved from the host container.</param>
/// <param name="packages">The package controller resolved from the same container.</param>
/// <param name="logger">Receives sample initialization progress.</param>
public sealed class SampleDataInitialization(DispatcherController dispatcher, PackageController packages, ILogger<SampleDataInitialization> logger)
{
    /// <summary>Creates the core categories and notice packages in the fresh development stores.</summary>
    /// <param name="cancellationToken">Cancels sample reading and controller operations.</param>
    /// <returns>A task that completes when all sample packages have been created.</returns>
    public async Task InitializeAsync(CancellationToken cancellationToken) {
        // Create Categories for the sample packages. These are required by the package controller to accept the sample packages.
        foreach (var category in new[] {
            (Id: "NoticeToMariners", Name: "Notices to Mariners", Prefix: "NM", Description: "Published navigation notices."),
            (Id: "GeneralSubmission", Name: "General Submissions", Prefix: "GS", Description: "Unclassified submissions supplied as ZIP files containing a contract and AOI shapefile.")
        }) {
            var created = await dispatcher.CreateCategory(new CreateCategoryRequest {
                Id = category.Id,
                DisplayName = category.Name,
                Prefix = category.Prefix,
                Description = category.Description,
            }, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create category '{category.Id}'");
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




        // Create a sample general submission package from the ZIP file in the Samples/GeneralSubmission directory.


        logger.LogInformation("Sample initialization completed. CreatedPackages: {CreatedPackages}.", files.Length);
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
            GeoJSON = notice.Geometry.Aoi,
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
