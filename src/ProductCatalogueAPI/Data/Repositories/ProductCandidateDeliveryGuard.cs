using Dapper;
using ProductCatalogueAPI.Data.Models;
using System.Data;

namespace ProductCatalogueAPI.Data.Repositories;

/// <summary>Shares exact-revision delivery protection across individual and paired candidate discard transactions.</summary>
internal static class ProductCandidateDeliveryGuard
{
    /// <summary>
    /// Locks evidence for the current candidate revision. Confirmed non-delivery is safe; a terminal
    /// rejection is safe only while the matching track is Rejected. Earlier revisions remain immutable.
    /// The caller holds the track update lock in a serializable transaction.
    /// </summary>
    internal static async Task<bool> IsBlockedAsync(IDbConnection connection, IDbTransaction transaction, Guid trackId, int? edition, int? update, ProductState state, CancellationToken cancellationToken) =>
        await connection.ExecuteScalarAsync<int>(new CommandDefinition("""
            SELECT COUNT(1) FROM dbo.ProductIcEncDelivery d WITH (UPDLOCK, HOLDLOCK)
            WHERE d.product_export_track_id = @TrackId
              AND d.status <> 'NotDelivered'
              AND NOT (d.status = 'Rejected' AND @State = @Rejected)
              AND d.product_revision_id = (
                  SELECT TOP (1) r.product_revision_id FROM dbo.ProductRevision r WITH (UPDLOCK, HOLDLOCK)
                  WHERE r.product_export_track_id = @TrackId
                    AND r.edition_number = @Edition AND r.update_number = @Update
                  ORDER BY r.created_at_utc DESC, r.product_revision_id DESC);
            """, new { TrackId = trackId, Edition = edition, Update = update, State = state, Rejected = ProductState.Rejected },
            transaction, cancellationToken: cancellationToken)) != 0;
}
