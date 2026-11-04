using DataCatalague.Api.Repositories;

namespace DataCatalague.Api.Services;

/// <summary>Stores dispatcher coverage and attachments on the ArcGIS thread.</summary>
public sealed class DispatcherResourceService(DispatchRepository coverage, PackageRepository packages, ArcGisDispatcher dispatcher)
{
    /// <summary>Reads a bounded uploaded ZIP without letting native rows or streams leave the ArcGIS thread.</summary>
    /// <param name="attachmentId">The UUID returned by the existing ZIP upload action.</param>
    /// <param name="maximumBytes">Maximum bytes accepted by the archive reader.</param>
    /// <param name="cancellationToken">Cancels native reads.</param>
    /// <returns>The preserved archive and filename, or null when no upload exists.</returns>
    public Task<(byte[] Data, string FileName)?> ReadArchiveAsync(Guid attachmentId, int maximumBytes, CancellationToken cancellationToken) {
        return dispatcher.ExecuteAsync(() => packages.ReadArchive(attachmentId, maximumBytes, cancellationToken));
    }

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
