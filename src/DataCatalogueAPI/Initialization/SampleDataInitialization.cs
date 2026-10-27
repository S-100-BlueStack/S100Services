using DataCatalague.Api.Controllers;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models.V1;
using Microsoft.AspNetCore.Mvc;
using PipelineController = DataCatalague.Api.Controllers.V1.DataCatalague.Api.Controllers.PipelineController;

namespace DataCatalague.Api.Initialization;

/// <summary>Creates development data through the registered controllers after the in-memory stores are reset.</summary>
/// <param name="dispatcher">The dispatcher controller resolved from the host container.</param>
/// <param name="packages">The package controller resolved from the same container.</param>
/// <param name="pipelines">The pipeline controller resolved from the same container.</param>
/// <param name="sampleReader">Reads development fixtures and prepares package controller requests.</param>
/// <param name="logger">Receives sample initialization progress.</param>
public sealed class SampleDataInitialization(DispatcherController dispatcher, PackageController packages, PipelineController pipelines, SamplePackageReader sampleReader, ILogger<SampleDataInitialization> logger)
{
    /// <summary>Creates sample pipelines, categories, packages and explicit bindings in the fresh development stores.</summary>
    /// <param name="cancellationToken">Cancels sample reading and controller operations.</param>
    /// <returns>A task that completes when sample creation and binding readback have succeeded.</returns>
    public async Task InitializeAsync(CancellationToken cancellationToken) {
        var pipelineSamples = new List<PipelineResponse>();
        foreach (var sample in new[] {
            (Name: "ENC", Description: "Electronic navigational chart production."),
            (Name: "Paper Chart", Description: "Paper chart production."),
        }) {
            var created = await pipelines.Create(new CreatePipelineRequest { DisplayName = sample.Name, Description = sample.Description }, cancellationToken).ConfigureAwait(false);
            var pipeline = RequireSuccess(created, $"create pipeline '{sample.Name}'");
            pipelineSamples.Add(pipeline);
            // Both pipelines have independent work areas. Packages may overlap several
            // areas, and assigning another pipeline never changes their source geometry.
            foreach (var area in new[] {
                (Name: "Western Denmark", West: 7.5, East: 11.0),
                (Name: "Eastern Denmark", West: 11.0, East: 16.0),
            }) {
                var json = System.Text.Json.JsonSerializer.Serialize(new {
                    rings = new[] { new[] { new[] { area.West, 54.0 }, new[] { area.West, 58.5 }, new[] { area.East, 58.5 }, new[] { area.East, 54.0 }, new[] { area.West, 54.0 } } },
                    spatialReference = new { wkid = 4326 },
                });
                RequireSuccess(await pipelines.AddWorkspace(pipeline.Id, new AddWorkspaceRequest {
                    DisplayName = area.Name, DisplayScale = new DisplayScale(), EsriJSON = json,
                }, cancellationToken).ConfigureAwait(false), $"create workspace '{area.Name}' in '{pipeline.DisplayName}'");
            }
            logger.LogInformation("Created sample pipeline {DisplayName}. PipelineId: {PipelineId}.", pipeline.DisplayName, pipeline.Id);
        }
        var packageSamples = new List<PackageResponse>();

        // Create Categories for the sample packages. These are required by the package controller to accept the sample packages.
        foreach (var category in new[] {
            (Id: "NoticeToMariners", Name: "Notices to Mariners", Prefix: "NM", Description: "Published navigation notices.", Specification: """
                # Notices to Mariners

                Development sample specification for published navigation notices.

                - Source: Niord notice JSON from `Samples/NoticesToMariners`.
                - Package identifier: a generated 18-character Nanoid; the published notice ID is kept in `metaData.shortId`.
                - Source metadata and part description HTML and related chart numbers are preserved on the package.
                - The AOI is the rectangular envelope of the detailed geometry.
                - Detailed geometry may contain points, curves and surfaces.
                """),
            (Id: "GeneralSubmission", Name: "General Submissions", Prefix: "GS", Description: "Unclassified submissions supplied as ZIP files containing a contract and AOI shapefile.", Specification: """
                # General Submissions

                Development sample specification for general submissions.

                - Source: ZIP archives from `Samples/GeneralSubmission`.
                - Package identifiers are generated Nanoids; `metaData.shortId` is allocated in `GS-NNN-YY` format.
                - Each sample contains `submission.json`, `contract.txt` and a complete AOI shapefile (`aoi.shp`, `aoi.shx`, `aoi.dbf`, `aoi.prj`).
                - The sample initializer reads the title and source from `submission.json`; geometry comes only from the shapefile.
                - The full shapefile polygon is saved as detailed geometry; its envelope becomes the AOI.
                - The manifest description is stored as a package description; chart references remain null.
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
            var request = await sampleReader.ReadNoticeAsync(file, cancellationToken).ConfigureAwait(false);
            logger.LogInformation("Creating notice sample {FileName} as package {PackageId}.", Path.GetFileName(file), request.MetaData?.ShortId);
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            packageSamples.Add(RequireSuccess(created, $"create notice package '{request.MetaData?.ShortId}'"));
        }




        // Both fixture formats use the same controller creation flow.
        var submissionDirectory = Path.Combine(AppContext.BaseDirectory, "Samples", "GeneralSubmission");
        var submissionFiles = Directory.GetFiles(submissionDirectory, "*.zip").Order(StringComparer.Ordinal).ToArray();
        if (submissionFiles.Length != 2) {
            throw new InvalidDataException($"Expected two general submission ZIP samples in '{submissionDirectory}', found {submissionFiles.Length}.");
        }

        foreach (var file in submissionFiles) {
            var request = await sampleReader.ReadGeneralSubmissionAsync(file, cancellationToken).ConfigureAwait(false);
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            packageSamples.Add(RequireSuccess(created, $"create general submission '{Path.GetFileName(file)}'"));
            logger.LogInformation("Created general submission sample {FileName}.", Path.GetFileName(file));
        }

        // Arbitrary fixture assignments only. Keeps the demo repeatable without inspecting package content.
        int?[] assignments = [0, null, 1, 1, null, 0, null, 1];
        var bindingCount = 0;
        for (var index = 0; index < packageSamples.Count; index++) {
            if (assignments[index % assignments.Length] is not { } pipelineIndex) { continue; }
            var package = packageSamples[index];
            var pipeline = pipelineSamples[pipelineIndex];
            var created = await dispatcher.CreateBinding(new BindRequest { PackageId = package.Id, PipelineId = pipeline.Id }, cancellationToken).ConfigureAwait(false);
            var binding = RequireSuccess(created, $"bind package '{package.Id}' to pipeline '{pipeline.DisplayName}'");
            var persisted = RequireSuccess(await dispatcher.GetBinding(binding.Id, cancellationToken).ConfigureAwait(false), $"read binding '{binding.Id}'");
            if (persisted.Id != binding.Id || persisted.PackageId != package.Id || persisted.PipelineId != pipeline.Id) {
                throw new InvalidOperationException($"Binding '{binding.Id}' did not retain the requested package and pipeline.");
            }
            bindingCount++;
        }

        logger.LogInformation("Sample initialization completed. CreatedPipelines: {CreatedPipelines}, CreatedPackages: {CreatedPackages}, CreatedBindings: {CreatedBindings}, UnboundPackages: {UnboundPackages}.", pipelineSamples.Count, packageSamples.Count, bindingCount, packageSamples.Count - bindingCount);
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
