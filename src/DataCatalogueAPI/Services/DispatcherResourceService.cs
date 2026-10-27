using DataCatalague.Api.Repositories;

namespace DataCatalague.Api.Services;

/// <summary>Stores dispatcher coverage and attachments on the ArcGIS thread.</summary>
public sealed class DispatcherResourceService(DispatchRepository coverage, PackageRepository packages, ArcGisDispatcher dispatcher)
{
    public Task<string> CreateSeverityAsync(string esriJson, ulong severity, CancellationToken cancellationToken) {
        return dispatcher.ExecuteAsync(() => {
            cancellationToken.ThrowIfCancellationRequested();
            ArcGIS.Core.Geometry.Polygon polygon;
            try { polygon = coverage.FromEsriJson(esriJson); }
            catch (Exception exception) when (exception is ArcGIS.Core.Geometry.Exceptions.GeometryException or ArgumentException) {
                throw new InvalidDataException("Invalid severity polygon Esri JSON.", exception);
            }
            return coverage.AddSeverityAOI(polygon, severity);
        });
    }

    public Task<Guid> StoreFileAsync(Stream stream, string fileName, CancellationToken cancellationToken) {
        return dispatcher.ExecuteAsync(() => {
            cancellationToken.ThrowIfCancellationRequested();
            return packages.AddAttachment(stream, fileName, DateTimeOffset.UtcNow);
        });
    }
}
