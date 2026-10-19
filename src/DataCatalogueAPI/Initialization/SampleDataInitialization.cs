using DataCatalague.Api.Controllers;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.PackageTypes;
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
        // Startup resets both stores; duplicate protection belongs to the creation actions.
        foreach (var type in Enum.GetValues<PackageType>()) {
            var categoryId = type.ToString();
            var displayName = type == PackageType.NoticeToMariners ? "Notices to Mariners" : categoryId;
            var created = await dispatcher.CreateCategory(new CreateCategoryRequest {
                Id = categoryId,
                DisplayName = displayName,
                Description = $"Incoming {displayName} packages.",
            }, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create category '{categoryId}'");
        }

        var directory = Path.Combine(AppContext.BaseDirectory, "Samples", "NoticesToMariners");
        var files = Directory.GetFiles(directory, "*.json").Order(StringComparer.Ordinal).ToArray();
        if (files.Length == 0) { throw new InvalidDataException($"No notice samples found in '{directory}'."); }

        foreach (var file in files) {
            var request = CreateRequest(await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false), file);
            logger.LogInformation("Creating notice sample {FileName} as package {PackageId}.", Path.GetFileName(file), request.Id);
            var created = await packages.CreatePackage(request, cancellationToken).ConfigureAwait(false);
            RequireSuccess(created, $"create notice package '{request.Id}'");
        }

        logger.LogInformation("Sample initialization completed. CreatedPackages: {CreatedPackages}.", files.Length);
    }

    private static CreatePackageRequest CreateRequest(string json, string sourceFile) {
        var notice = NoticeToMariners.Parse(json);
        return new CreatePackageRequest {
            Id = notice.Id,
            Category = nameof(PackageType.NoticeToMariners),
            AbsoluteUri = new Uri(sourceFile).AbsoluteUri,
            GeoJSON = notice.Geometry.Aoi,
            DetailedGeometry = notice.Geometry,
            MetaData = notice.MetaData,
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
