using ArcGIS.Core.Geometry;
using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using DataCatalague.Api.Repositories;
using Eventuous;

namespace DataCatalague.Api.Initialization;

/// <summary>Builds development data exclusively through constructor-injected application services.</summary>
/// <remarks>Creates sample values and commands; service construction and lifetime belong to the host container.</remarks>
/// <param name="store">The shared in-memory event store.</param>
/// <param name="categories">The existing category command service.</param>
/// <param name="packages">The existing package command service.</param>
/// <param name="repository">The registered package geometry repository.</param>
/// <param name="dispatcher">The registered ArcGIS thread dispatcher.</param>
/// <param name="streamNames">The stream name map registered by Program.</param>
/// <param name="logger">Receives sample initialization progress.</param>
public sealed class SampleDataInitialization(IEventStore store, ICommandService<CategoryState> categories, ICommandService<PackageState> packages, PackageRepository repository, ArcGisDispatcher dispatcher, StreamNameMap streamNames, ILogger<SampleDataInitialization> logger)
{
    /// <summary>Registers the categories and sample packages through the existing command services.</summary>
    /// <param name="cancellationToken">Cancels sample reading and command persistence.</param>
    /// <returns>A task that completes when all samples have been registered.</returns>
    public async Task InitializeAsync(CancellationToken cancellationToken) {
        var directory = Path.Combine(AppContext.BaseDirectory, "Samples", "Notices2Mariner");
        var files = Directory.GetFiles(directory, "*.json").Order(StringComparer.Ordinal).ToArray();
        if (files.Length == 0) { throw new InvalidDataException($"No notice samples found in '{directory}'."); }
        var samples = new List<(string File, NoticeSample Notice)>();
        foreach (var file in files) {
            samples.Add((file, NoticeSample.Parse(await File.ReadAllTextAsync(file, cancellationToken).ConfigureAwait(false))));
        }
        if (samples.Select(sample => sample.Notice.Id).Distinct(StringComparer.Ordinal).Count() != samples.Count) {
            throw new InvalidDataException("Notice sample files contain duplicate notice IDs.");
        }

        foreach (var category in new[] { "Notices2Mariner", "Standard" }) {
            if (!await store.StreamExists(streamNames.GetStreamName(new CategoryId(category)), cancellationToken).ConfigureAwait(false)) {
                (await categories.Handle(new DispatcherCommands.CreateCategory(category, category), cancellationToken).ConfigureAwait(false)).ThrowIfError();
                logger.LogInformation("Created sample category {CategoryId}.", category);
            }
            else {
                logger.LogInformation("Sample category {CategoryId} already exists.", category);
            }
            var state = await store.LoadState<CategoryState, CategoryId>(streamNames, new(category), true, cancellationToken).ConfigureAwait(false);
            if (state.State.Id?.Value != category || state.State.IsTerminated) {
                throw new InvalidOperationException($"Sample category '{category}' is unavailable.");
            }
        }

        foreach (var (file, notice) in samples) {
            if (await store.StreamExists(streamNames.GetStreamName(new PackageId(notice.Id)), cancellationToken).ConfigureAwait(false)) { continue; }
            logger.LogInformation("Registering notice sample {FileName} as package {PackageId} ({ShortId}).", Path.GetFileName(file), notice.Id, notice.MetaData.ShortId);
            var uri = new Uri(file).AbsoluteUri;
            var geometry = notice.Geometry;
            var references = await dispatcher.ExecuteAsync(() => {
                var aoi = PolygonBuilderEx.FromJson(geometry.Aoi);
                var points = geometry.Points is null ? null : MultipointBuilderEx.FromJson(geometry.Points);
                var curves = geometry.Curves is null ? null : PolylineBuilderEx.FromJson(geometry.Curves);
                var surfaces = geometry.Surfaces is null ? null : PolygonBuilderEx.FromJson(geometry.Surfaces);
                return repository.AddPackageGeometries(aoi, points, curves, surfaces, notice.Id, uri, cancellationToken);
            }).ConfigureAwait(false);

            (await packages.Handle(new PackagesCommands.CreatePackage(notice.Id, "Notices2Mariner", Path.GetFileName(file), uri, references.Aoi, ulong.MaxValue, notice.MetaData, null), cancellationToken).ConfigureAwait(false)).ThrowIfError();
            (await packages.Handle(new PackagesCommands.AddDetailedGeometry(notice.Id, references.Details.PointRef, references.Details.CurveRef, references.Details.SurfaceRef, references.Details.PointRefs), cancellationToken).ConfigureAwait(false)).ThrowIfError();
        }
        logger.LogInformation("Sample initialization completed: two categories and {PackageCount} notice packages registered.", samples.Count);
    }
}
