using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Reserves immutable live candidates and records transfer outcomes in SQL; simulation reservations retain permanent provenance.</summary>
public interface IIcEncDeliveryRepository
{
    /// <summary>Atomically reserves the exact current candidate and its outgoing file evidence.</summary>
    Task<IcEncDelivery?> ReserveAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken);
    /// <summary>Reserves a synthetic send with durable provenance; retries reuse the same job reservation.</summary>
    /// <param name="datasetName">Canonical ENC member dataset.</param>
    /// <param name="specification">Exact S57 or S101 output.</param>
    /// <param name="edition">Expected candidate edition.</param>
    /// <param name="update">Expected candidate update.</param>
    /// <param name="jobId">Stable idempotency identity retained across retries.</param>
    /// <param name="nowUtc">UTC reservation time.</param>
    /// <param name="cancellationToken">Cancels before committing the reservation.</param>
    /// <param name="packageId">Expected shared snapshot, when invoked by package Send.</param>
    /// <param name="revisionId">Expected immutable revision; guards rebuilds reusing version numbers.</param>
    /// <returns>The existing or new simulated reservation, or null after a stale or ineligible request.</returns>
    Task<IcEncDelivery?> ReserveSimulationAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken, Guid? packageId = null, Guid? revisionId = null) => throw new NotSupportedException("Simulation delivery reservations are not supported by this repository.");
    /// <summary>Records successful transport without implying IC-ENC validation acceptance.</summary>
    Task MarkDeliveredAsync(Guid deliveryId, DateTime nowUtc, CancellationToken cancellationToken);
    /// <summary>Locks an uncertain transfer against unsafe automatic resending.</summary>
    Task MarkUncertainAsync(Guid deliveryId, DateTime nowUtc, string reason, CancellationToken cancellationToken);
    /// <summary>Resolves an uncertain transfer after an operator independently verifies intake.</summary>
    Task<bool> ReconcileAsync(Guid deliveryId, bool receivedByIcEnc, string? owner, DateTime nowUtc, CancellationToken cancellationToken);
}

/// <summary>Transports an already reserved immutable exchange set; simulation never invokes this boundary.</summary>
public interface IIcEncTransport
{
    /// <summary>Uploads the exact reserved bytes and returns the verified remote directory.</summary>
    Task<string> UploadAsync(IcEncDelivery delivery, CancellationToken cancellationToken);
}

/// <summary>The ZIP belongs to the exact revision/version reserved by the live send job.</summary>
/// <param name="Id">Actual persisted delivery identifier.</param>
/// <param name="DatasetName">Canonical outgoing dataset.</param>
/// <param name="Specification">S-57 or S-101 format.</param>
/// <param name="Edition">Reserved edition.</param>
/// <param name="Update">Reserved update.</param>
/// <param name="ExchangeSet">Immutable stored exchange-set bytes.</param>
public sealed record IcEncDelivery(Guid Id, string DatasetName, ProductSpecification Specification, int Edition, int Update, byte[] ExchangeSet) {
    /// <summary>Immutable reserved revision, required for generated response matching.</summary>
    public Guid RevisionId { get; init; }
    /// <summary>Track owning the reserved candidate.</summary>
    public Guid TrackId { get; init; }
    /// <summary>Persisted UTC reservation time, preserved across retries.</summary>
    public DateTime ReservedAtUtc { get; init; }
}
