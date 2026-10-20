using DataCatalague.Api.Controllers;
using DataCatalague.Api.Domain;
using DataCatalague.Api.PackageTypes;
using DataCatalague.Api.Models.V1;
using Microsoft.AspNetCore.Mvc;

namespace DataCatalague.Api.Initialization;

/// <summary>Creates development data through the registered controllers after the in-memory stores are reset.</summary>
/// <param name="dispatcher">The dispatcher controller resolved from the host container.</param>
/// <param name="packages">The package controller resolved from the same container.</param>
/// <param name="packageTypes">The registered category-specific source readers.</param>
/// <param name="logger">Receives sample initialization progress.</param>
public sealed class SampleDataInitialization(DispatcherController dispatcher, PackageController packages, PackageTypeFactory packageTypes, ILogger<SampleDataInitialization> logger)
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
                - The sample initializer reads the title and source from `submission.json`; geometry comes only from the shapefile.
                - The full shapefile polygon is saved as detailed geometry; its envelope becomes the AOI.
                - Manifest metadata is preserved as category-specific data without embedded coordinates.
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
            var request = await packageTypes.CreateRequestAsync("NoticeToMariners", file, cancellationToken).ConfigureAwait(false);
            logger.LogInformation("Creating notice sample {FileName} as package {PackageId}.", Path.GetFileName(file), request.Id);
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create notice package '{request.Id}'");
        }




        // Both source formats use registered readers and the same creation flow.
        var submissionDirectory = Path.Combine(AppContext.BaseDirectory, "Samples", "GeneralSubmission");
        var submissionFiles = Directory.GetFiles(submissionDirectory, "*.zip").Order(StringComparer.Ordinal).ToArray();
        if (submissionFiles.Length != 2) {
            throw new InvalidDataException($"Expected two general submission ZIP samples in '{submissionDirectory}', found {submissionFiles.Length}.");
        }

        foreach (var file in submissionFiles) {
            var request = await packageTypes.CreateRequestAsync("GeneralSubmission", file, cancellationToken).ConfigureAwait(false);
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create general submission '{Path.GetFileName(file)}'");
            logger.LogInformation("Created general submission sample {FileName}.", Path.GetFileName(file));
        }

        logger.LogInformation("Sample initialization completed. CreatedPackages: {CreatedPackages}.", files.Length + submissionFiles.Length);
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
