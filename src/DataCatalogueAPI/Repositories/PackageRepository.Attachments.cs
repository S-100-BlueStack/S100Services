using ArcGIS.Core.Data;
using System.Text.Json;

namespace DataCatalague.Api.Repositories;

public partial class PackageRepository
{
    /// <summary>Copies a bounded stored archive out of its native row; call on the registered ArcGIS dispatcher.</summary>
    /// <param name="attachmentId">A parsed upload-issued attachment UUID.</param>
    /// <param name="maximumBytes">Maximum archive bytes allowed by the importer.</param>
    /// <param name="cancellationToken">Cancels before and after native reads.</param>
    /// <returns>The original bytes and filename, or null when the attachment does not exist.</returns>
    internal (byte[] Data, string FileName)? ReadArchive(Guid attachmentId, int maximumBytes, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        using var connector = this.createGeodatabase();
        using var attachment = connector.OpenDataset<Table>(this._standaloneTableDefinitions["attachment"].GetName());
        using var definition = attachment.GetDefinition();
        var filter = new QueryFilter {
            // Only a parsed UUID and the server-owned field name enter SQL.
            WhereClause = $"{definition.GetGlobalIDField()} = '{attachmentId.ToString("B").ToUpperInvariant()}'",
            SubFields = "json,data_size,data",
        };
        using var cursor = attachment.Search(filter, false);
        if (!cursor.MoveNext()) { return null; }
        using var row = cursor.Current;
        var size = Convert.ToInt64(row["data_size"], System.Globalization.CultureInfo.InvariantCulture);
        if (size <= 0 || size > maximumBytes) { throw new InvalidDataException("The stored MA archive must be nonempty and no larger than 16 MiB."); }
        using var data = row["data"] as MemoryStream ?? throw new InvalidDataException("The uploaded archive has no stored content.");
        if (data.Length != size || data.Length > maximumBytes) { throw new InvalidDataException("The stored archive size does not match its content."); }
        S100BlueStack.Settings.SupportFile? supportFile;
        try { supportFile = JsonSerializer.Deserialize<S100BlueStack.Settings.SupportFile>((string)row["json"], jsonSerializerOptions); }
        catch (JsonException exception) { throw new InvalidDataException("The stored archive metadata is invalid.", exception); }
        var fileName = supportFile?.FileName;
        if (string.IsNullOrWhiteSpace(fileName) || !Path.GetExtension(fileName).Equals(".zip", StringComparison.OrdinalIgnoreCase)) {
            throw new InvalidDataException("The uploaded MA source must be a ZIP file.");
        }
        cancellationToken.ThrowIfCancellationRequested();
        return (data.ToArray(), fileName);
    }
}
