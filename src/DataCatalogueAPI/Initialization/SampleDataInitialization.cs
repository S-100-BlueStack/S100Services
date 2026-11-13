using DataCatalague.Api.Controllers;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Models.V1;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
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
    /// <summary>Creates sample pipelines, categories, packages in the fresh development stores.</summary>
    /// <param name="cancellationToken">Cancels sample reading and controller operations.</param>
    /// <returns>A task that completes when sample creation have succeeded.</returns>
    public async Task InitializeAsync(CancellationToken cancellationToken) {
        var pipelineSamples = new List<PipelineResponse>();
        foreach (var sample in new[] {
            (Name: "ENC", Description: "Electronic navigational chart production.", FileName: "ENC.json"),
            (Name: "Paper Chart", Description: "Paper chart production.", FileName: "PaperChart.json"),
        }) {
            var created = await pipelines.Create(new CreatePipelineRequest { DisplayName = sample.Name, Description = sample.Description }, cancellationToken).ConfigureAwait(false);
            var pipeline = RequireSuccess(created, $"create pipeline '{sample.Name}'");
            pipelineSamples.Add(pipeline);

            var path = Path.Combine(AppContext.BaseDirectory, "Samples", "Workspaces", sample.FileName);
            await using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
            var areas = await JsonSerializer.DeserializeAsync<WorkspaceSample[]>(input, new JsonSerializerOptions(JsonSerializerDefaults.Web), cancellationToken).ConfigureAwait(false);
            if (areas is null || areas.Length == 0) { throw new InvalidDataException($"No sample workspaces found in '{path}'."); }
            foreach (var area in areas) {
                if (area is null || string.IsNullOrWhiteSpace(area.DisplayName) || area.Aoi.ValueKind != JsonValueKind.Object) {
                    throw new InvalidDataException($"Each workspace in '{path}' requires displayName and an aoi Esri JSON object.");
                }
                RequireSuccess(await pipelines.AddWorkspace(pipeline.Id, new AddWorkspaceRequest {
                    DisplayName = area.DisplayName,
                    DisplayScale = area.DisplayScale ?? new DisplayScale(),
                    EsriJSON = area.Aoi.GetRawText(),
                }, cancellationToken).ConfigureAwait(false), $"create workspace '{area.DisplayName}' in '{pipeline.DisplayName}'");
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
                """),
            (Id: "MarineAggregateExtraction", Name: "Marine Aggregate Extraction Areas", Prefix: "MA", Description: "Marine sand, gravel and stone extraction sites supplied by Miljøstyrelsen / MARIS.", Specification: """
                # Marine Aggregate Extraction Areas

                Danish source category: Indvindingsområder.

                - Source: ZIP submissions in `Samples/MarineAggregateExtraction`, each with manifest.json and areas.geojson.
                - Startup uploads at most 10 ZIPs in filename order, then creates packages through the same archive import flow used by HTTP clients.
                - One site per archive; the source UUID is retained in `metaData.refId` and the original ZIP is stored as an attachment.
                - Catalogue short IDs are allocated as `MA-NNN-YY`; source area numbers remain in the title and description.
                - Full Polygon/MultiPolygon geometry, including holes, is stored as surfaces in WGS84; the envelope becomes the AOI.
                - Common, Auction and Builder remain source extraction types, not separate categories.
                - Descriptions preserve permit dates, snapshot status, remarks and permit links; all external text is HTML-encoded.
                - Includes expired sites. Snapshot status and dates do not establish current permit validity.
                - No live fetch, WFS merge, scheduled synchronization or automatic chart/pipeline assignment is performed.
                """),
            (Id: "WorkZone", Name: "WorkZone", Prefix: "WZ", Description: "Case and document submissions originating from WorkZone, supplied with supplementary geographical AOIs.", Specification: """
                # WorkZone submissions

                - WorkZone means the WorkZone case/document management system. Each package represents a submission from one case.
                - This is a DataCatalogue ZIP contract, not a native WorkZone export schema or live integration.
                - Required root files: `workzone.json` and supplementary `aoi.geojson`.
                - Metadata requires `schemaVersion: "1.0"`, `category: "WorkZone"`, `title`, `summary` and `caseNumber`.
                - Optional `caseId` is an opaque source identifier; optional `language` defaults to `en`.
                - Optional `documents` entries require unique `documentId` and `title`, with optional `documentNumber` and `file`.
                - Every included document file must be referenced under `documents/`; metadata-only document entries are allowed.
                - Package source is WorkZone; `metaData.refId` retains the case number. Internal case/document references are retained in the ZIP and encoded descriptions.
                - Source case numbers do not replace catalogue IDs: Nanoids and allocated `WZ-NNN-YY` short IDs remain unchanged.
                - The supplementary AOI accepts WGS84 Polygon/MultiPolygon, Feature or a one-feature FeatureCollection.
                - Complete polygons are stored as surfaces; their envelopes become catalogue AOIs.
                - Startup imports five fictional case submissions, each with sample document files, using the registered upload/import controllers.
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

        var extractionDirectory = Path.Combine(AppContext.BaseDirectory, "Samples", "MarineAggregateExtraction");
        var extractionFiles = Directory.GetFiles(extractionDirectory, "*.zip").Order(StringComparer.Ordinal).Take(10).ToArray();
        if (extractionFiles.Length == 0) {
            throw new InvalidDataException($"No MA ZIP samples found in '{extractionDirectory}'.");
        }
        foreach (var file in extractionFiles) {
            await using var input = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
            var upload = RequireSuccess(await packages.UploadFile(new UploadFileRequest {
                File = new FormFile(input, 0, input.Length, "File", Path.GetFileName(file)),
            }, cancellationToken).ConfigureAwait(false), $"store MA sample '{Path.GetFileName(file)}'");
            var request = new CreatePackageRequest {
                Category = "MarineAggregateExtraction",
                AbsoluteUri = upload.AbsoluteUri!,
                ImportFromArchive = true,
            };
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            packageSamples.Add(RequireSuccess(created, $"import MA sample '{Path.GetFileName(file)}'"));
        }
        logger.LogInformation("Created marine aggregate extraction ZIP samples. CreatedPackages: {CreatedPackages}.", extractionFiles.Length);

        var workZoneDirectory = Path.Combine(AppContext.BaseDirectory, "Samples", "WorkZone");
        var workZoneFiles = Directory.GetFiles(workZoneDirectory, "*.zip").Order(StringComparer.Ordinal).Take(5).ToArray();
        if (workZoneFiles.Length != 5) { throw new InvalidDataException($"Expected five WorkZone ZIP samples in '{workZoneDirectory}', found {workZoneFiles.Length}."); }
        foreach (var file in workZoneFiles) {
            await using var input = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
            var upload = RequireSuccess(await packages.UploadFile(new UploadFileRequest {
                File = new FormFile(input, 0, input.Length, "File", Path.GetFileName(file)),
            }, cancellationToken).ConfigureAwait(false), $"store WorkZone sample '{Path.GetFileName(file)}'");
            var created = await packages.CreatePackage(new CreatePackageRequest {
                Category = "WorkZone",
                AbsoluteUri = upload.AbsoluteUri!,
                ImportFromArchive = true,
            }, cancellationToken).ConfigureAwait(false);
            packageSamples.Add(RequireSuccess(created, $"import WorkZone sample '{Path.GetFileName(file)}'"));
        }
        logger.LogInformation("Created WorkZone ZIP samples. CreatedPackages: {CreatedPackages}.", workZoneFiles.Length);

        // Verify the same read path used by clients, including event replay and
        // native row resolution. Never finish startup with unusable sample geometry.
        foreach (var package in packageSamples) {
            var geometry = RequireSuccess(await packages.GetGeometry(package.Id, cancellationToken).ConfigureAwait(false), $"read geometry for sample '{package.MetaData?.ShortId ?? package.Id}'");
            if (geometry.Aoi is not { ValueKind: JsonValueKind.Object } || geometry.DetailedGeometry is not { } details
                || (details.Points.Count == 0 && details.Curves is null && details.Surfaces is null)) {
                throw new InvalidDataException($"Sample package '{package.Id}' requires a stored AOI and detailed geometry.");
            }
        }

        // Shuffle without replacement so exactly half are assigned once. Rotate
        // through shuffled pipelines to exercise both routes with varied packages.
        var shuffledPackages = packageSamples.ToArray();
        var shuffledPipelines = pipelineSamples.ToArray();
        Random.Shared.Shuffle(shuffledPackages.AsSpan());
        Random.Shared.Shuffle(shuffledPipelines.AsSpan());
        var assignedCount = shuffledPackages.Length / 2;
        for (var index = 0; index < assignedCount; index++) {
            RequireSuccess(await dispatcher.CreateBinding(new BindRequest {
                PackageId = shuffledPackages[index].Id,
                PipelineId = shuffledPipelines[index % shuffledPipelines.Length].Id,
            }, cancellationToken).ConfigureAwait(false), $"assign sample package '{shuffledPackages[index].Id}' to a pipeline");
        }
        logger.LogInformation("Verified sample geometry and assigned packages. VerifiedPackages: {VerifiedPackages}, AssignedPackages: {AssignedPackages}.", packageSamples.Count, assignedCount);

        logger.LogInformation("Sample initialization completed. CreatedPipelines: {CreatedPipelines}, CreatedPackages: {CreatedPackages}.", pipelineSamples.Count, packageSamples.Count);
    }

    private sealed record WorkspaceSample(string DisplayName, JsonElement Aoi, DisplayScale? DisplayScale = null);

    private static T RequireSuccess<T>(ActionResult<T> response, string operation) {
        if (response.Value is { } value) { return value; }
        if (response.Result is ObjectResult { Value: T result } objectResult && objectResult.StatusCode is >= 200 and < 300) {
            return result;
        }
        var status = (response.Result as ObjectResult)?.StatusCode;
        var error = response.Result switch {
            ObjectResult { Value: ValidationProblemDetails problem } => string.Join(" ", problem.Errors.OrderBy(entry => entry.Key, StringComparer.Ordinal).SelectMany(entry => entry.Value.Select(message => $"{entry.Key}: {message}"))),
            ObjectResult { Value: ProblemDetails problem } => string.Join(" ", new[] { problem.Title, problem.Detail }.Where(value => !string.IsNullOrWhiteSpace(value))),
            _ => null,
        };
        throw new InvalidOperationException($"Could not {operation}; controller returned {status?.ToString() ?? response.Result?.GetType().Name ?? "no result"}.{(string.IsNullOrWhiteSpace(error) ? string.Empty : $" {error}")}");
    }
}
