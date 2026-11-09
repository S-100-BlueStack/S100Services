using ArcGIS.Core.Data;

namespace S100FC.ProductCatalogue;

/// <summary>Refreshes and verifies read-only S-101 source snapshots on the existing ArcGIS execution lane.</summary>
public partial class ProductManagerGDB
{
    /// <summary>Keeps every source definition owned by the enumeration, including cancellation and early exits.</summary>
    /// <param name="connection">Source geodatabase on the existing ArcGIS lane.</param>
    /// <returns>Definitions valid only until the enumeration is disposed.</returns>
    private static IEnumerable<FeatureClassDefinition> GetSourceFeatureClassDefinitions(Geodatabase connection) {
        var definitions = connection.GetDefinitions<FeatureClassDefinition>();
        try {
            foreach (var definition in definitions) yield return definition;
        }
        finally {
            foreach (var definition in definitions) definition.Dispose();
        }
    }

    /// <summary>Refreshes the connected version before tables/cursors are opened, without reconciling, posting or changing versions.</summary>
    /// <param name="connection">Source geodatabase opened on the manager's ArcGIS lane.</param>
    /// <param name="operation">Stable diagnostic label identifying the read.</param>
    /// <param name="datasetName">Dataset being rebuilt, or null for a multi-product archive scan.</param>
    private static void RefreshSourceVersion(Geodatabase connection, string operation, string? datasetName) {
        if (!connection.IsVersioningSupported()) return;
        using var manager = connection.GetVersionManager();
        using var version = manager.GetCurrentVersion();
        version.Refresh();
        Logger.Information("S-101 source version refreshed before read. Operation: {Operation}. DatasetName: {DatasetName}. VersionName: {VersionName}.",
            operation, datasetName, version.GetName());
    }

    /// <summary>Captures bindings only for requested changed GUIDs, before recycling a native row.</summary>
    /// <param name="row">Current source row, still owned by its cursor scope.</param>
    /// <param name="tableName">Trusted name obtained from the opened source dataset.</param>
    /// <param name="required">Validated changed GlobalIDs requiring verification.</param>
    /// <param name="snapshots">Managed binding snapshots for this attempt.</param>
    private static void CaptureSourceAttributes(Row row, string tableName, ISet<Guid> required, ICollection<SourceSnapshotAttributes> snapshots) {
        if (required.Count == 0) return;
        var id = Guid.Parse(ReadFeatureId(row));
        if (required.Contains(id)) snapshots.Add(ReadSourceAttributes(row, tableName, id));
    }

    /// <summary>Copies current source fields without retaining rows or exposing their content in diagnostics.</summary>
    /// <param name="row">Source or archived row.</param>
    /// <param name="tableName">Trusted source table name.</param>
    /// <param name="id">Validated source GlobalID.</param>
    /// <returns>Managed values used for archive comparison.</returns>
    private static SourceSnapshotAttributes ReadSourceAttributes(Row row, string tableName, Guid id) => new(tableName, id,
        ReadOptionalString(row, "code") ?? string.Empty, ReadOptionalString(row, "attributebindings"),
        ReadOptionalString(row, "informationbindings"), ReadOptionalString(row, "featurebindings"));

    /// <summary>Checks the selected changed rows against live open-ended archive records, including edits made after the scan cutoff.</summary>
    /// <param name="connection">Refreshed source geodatabase on the ArcGIS execution lane.</param>
    /// <param name="datasetName">Dataset being rebuilt.</param>
    /// <param name="snapshots">Values actually consumed during the current read attempt.</param>
    /// <param name="cancellationToken">Cancels between tables, batches and archive rows.</param>
    /// <exception cref="SourceSnapshotMismatchException">Bindings changed, or a current archive row is missing or ambiguous.</exception>
    /// <exception cref="InvalidOperationException">A selected source table cannot supply archive verification.</exception>
    private void VerifySourceAttributes(Geodatabase connection, string datasetName, IReadOnlyCollection<SourceSnapshotAttributes> snapshots, CancellationToken cancellationToken) {
        if (snapshots.Count == 0) return;
        var syntax = connection.GetSQLSyntax();
        var openEnd = syntax.Format(new DateTime(9999, 12, 31), SQLDateTimeType.Timestamp);
        foreach (var group in snapshots.GroupBy(snapshot => snapshot.TableName, StringComparer.OrdinalIgnoreCase)) {
            cancellationToken.ThrowIfCancellationRequested();
            var duplicate = group.GroupBy(snapshot => snapshot.Id).FirstOrDefault(rows => rows.Count() > 1);
            if (duplicate is not null)
                throw new SourceSnapshotMismatchException(datasetName, duplicate.First(), "multiple current source rows");
            using var table = connection.OpenDataset<Table>(group.Key);
            if (!table.IsArchiveEnabled())
                throw new InvalidOperationException("A changed S-101 source row cannot be verified because its table is not archive-enabled.");
            if (table.GetRegistrationType() == RegistrationType.Versioned) {
                using var manager = connection.GetVersionManager();
                using var version = manager.GetCurrentVersion();
                using var defaultVersion = manager.GetDefaultVersion();
                if (!string.Equals(version.GetName(), defaultVersion.GetName(), StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Archive verification of versioned S-101 rows requires a DEFAULT connection; no version was changed.");
            }
            using var archive = table.GetArchiveTable();
            foreach (var batch in group.Chunk(100)) {
                cancellationToken.ThrowIfCancellationRequested();
                // GUIDs are parsed before interpolation; table names originate from ArcGIS, never request text.
                var ids = string.Join(',', batch.Select(snapshot => $"'{snapshot.Id:B}'"));
                var archived = new Dictionary<Guid, SourceSnapshotAttributes>();
                using (var cursor = archive.Search(new QueryFilter {
                    // Non-spatial classes need not have both optional binding columns.
                    WhereClause = $"GLOBALID IN ({ids}) AND GDB_TO_DATE >= {openEnd}"
                }, true)) {
                    while (cursor.MoveNext()) {
                        cancellationToken.ThrowIfCancellationRequested();
                        using var row = cursor.Current;
                        var id = Guid.Parse(ReadFeatureId(row));
                        var value = ReadSourceAttributes(row, group.Key, id);
                        if (!archived.TryAdd(id, value))
                            throw new SourceSnapshotMismatchException(datasetName, value, "multiple current archive rows");
                    }
                }
                foreach (var read in batch)
                    SourceSnapshotFreshness.RequireMatch(datasetName, read, archived.GetValueOrDefault(read.Id));
            }
        }
        if (snapshots.Count > 0)
            Logger.Information("S-101 source snapshot bindings verified against current archive. DatasetName: {DatasetName}. ChangedRowCount: {ChangedRowCount}.", datasetName, snapshots.Count);
    }
}
