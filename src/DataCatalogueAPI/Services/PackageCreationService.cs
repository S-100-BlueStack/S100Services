using ArcGIS.Core.Geometry;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Repositories;
using Eventuous;
using System.ComponentModel.DataAnnotations;
using IO = System.IO;

namespace DataCatalague.Api.Services;

public enum PackageCreationError { Validation, Conflict, Persistence }

public sealed class PackageCreationException(PackageCreationError error, string message, string? detail = null) : Exception(message)
{
    public PackageCreationError Error { get; } = error;
    public string? Detail { get; } = detail;
}

/// <summary>Coordinates package validation, identity reservation, geometry persistence and creation events.</summary>
public sealed class PackageCreationService(IEventStore eventStore, StreamNameMap streams, ICommandService<PackageState> commands, PackageRepository packages, PackageIdentityService identities, ArcGisDispatcher dispatcher, ILogger<PackageCreationService> logger)
{
    // Event and geometry writes cannot share a transaction; serialize reservations
    // across service instances until their persistence outcome is known.
    private static readonly SemaphoreSlim CreationGate = new(1, 1);

    public async Task<PackageState> CreateAsync(CreatePackageRequest request, CancellationToken cancellationToken) {
        if (request is null) { throw new PackageCreationException(PackageCreationError.Validation, "Invalid package request.", "A category, absolute source URI and geometry are required."); }

        // Initialization calls controllers directly, so validation must also run here.
        var validationErrors = new List<ValidationResult>();
        if (!Validator.TryValidateObject(request, new ValidationContext(request), validationErrors, validateAllProperties: true)
            || !Uri.TryCreate(request.AbsoluteUri, UriKind.Absolute, out _)) {
            throw new PackageCreationException(PackageCreationError.Validation, "Invalid package request.", "A category, absolute source URI and geometry are required.");
        }

        await CreationGate.WaitAsync(cancellationToken);
        (string Id, string ShortId)? identity = null;
        var geometryCommitted = false;
        try {
            var categoryId = new CategoryId(request.Category);
            var categoryStream = streams.GetStreamName(categoryId);

            if (!await eventStore.StreamExists(categoryStream, cancellationToken)) {
                throw new PackageCreationException(PackageCreationError.Validation, "Category does not exist.", $"No category exists with identifier '{request.Category}'.");
            }

            var category = await eventStore.LoadState<CategoryState, CategoryId>(streams, categoryId, true, cancellationToken);

            if (category.State.IsTerminated) {
                throw new PackageCreationException(PackageCreationError.Validation, "Category is terminated.", $"Category '{request.Category}' no longer accepts packages.");
            }

            if (string.IsNullOrEmpty(category.State.Prefix)) {
                throw new PackageCreationException(PackageCreationError.Validation, "Category has no identifier prefix.");
            }
            var sourceShortId = request.MetaData?.ShortId;
            if (sourceShortId is not null && !System.Text.RegularExpressions.Regex.IsMatch(sourceShortId, $@"\A{System.Text.RegularExpressions.Regex.Escape(category.State.Prefix)}-[0-9]{{3,}}-[0-9]{{2}}\z")) {
                throw new PackageCreationException(PackageCreationError.Validation, "Metadata shortId must match PREFIX-NNN-YY (with at least three sequence digits).");
            }
            identity = identities.Reserve(category.State.Prefix, sourceShortId, DateTimeOffset.UtcNow);
            if (identity is null) {
                throw new PackageCreationException(PackageCreationError.Conflict, "Package short ID already exists.", $"Short ID '{sourceShortId}' is already reserved.");
            }
            var streamId = identity.Value.Id;
            var metadata = request.MetaData is { } supplied
                ? supplied with { ShortId = identity.Value.ShortId }
                : new PackageMetaData(identity.Value.ShortId, request.Category, null, null, null, DateTimeOffset.UtcNow);

            var references = await dispatcher.ExecuteAsync(() => {
                cancellationToken.ThrowIfCancellationRequested();

                if (request.DetailedGeometry is { } geometry) {
                    var aoi = PolygonBuilderEx.FromJson(geometry.Aoi);
                    var points = geometry.Points is null ? null : MultipointBuilderEx.FromJson(geometry.Points);
                    var curves = geometry.Curves is null ? null : PolylineBuilderEx.FromJson(geometry.Curves);
                    var surfaces = geometry.Surfaces is null ? null : PolygonBuilderEx.FromJson(geometry.Surfaces);

                    if ((points is null && curves is null && surfaces is null)
                        || points?.IsEmpty == true
                        || curves?.IsEmpty == true
                        || surfaces?.IsEmpty == true) {
                        throw new InvalidDataException("Detailed geometry must contain at least one group, and supplied groups must not be empty.");
                    }

                    return packages.AddPackageGeometries(aoi, points, curves, surfaces, streamId, request.AbsoluteUri, cancellationToken);
                }

                var polygon = packages.FromEsriJson(request.EsriJSON);
                return (Aoi: packages.AddPackageAOI(polygon, streamId, request.AbsoluteUri), Details: (DetailedGeometry?)null);
            });

            geometryCommitted = true;
            var filename = IO.Path.GetFileName(request.AbsoluteUri);

            // Once geometry commits, finish recording its references even if the caller disconnects.
            var cmd = await commands.Handle(new PackagesCommands.CreatePackage(streamId, category.State.Id, filename, request.AbsoluteUri, references.Aoi, request.Severity, metadata, request.DisplayScale, references.Details, request.Descriptions, request.Charts), CancellationToken.None);

            if (!cmd.Success) {
                logger.LogError("Package command failed after geometry persistence. PackageId: {PackageId}, ShortId: {ShortId}, Aoi: {Aoi}, Details: {@Details}.", streamId, metadata.ShortId, references.Aoi, references.Details);
                throw new PackageCreationException(PackageCreationError.Persistence, "Could not record the package after storing its geometry.");
            }

            var result = cmd.Get()!;

            return result.State;
        }
        catch (InvalidDataException exception) {
            throw new PackageCreationException(PackageCreationError.Validation, "Invalid package geometry.", exception.Message);
        }
        finally {
            if (!geometryCommitted && identity is { } reserved) { identities.Release(reserved.ShortId); }
            CreationGate.Release();
        }
    }
}
