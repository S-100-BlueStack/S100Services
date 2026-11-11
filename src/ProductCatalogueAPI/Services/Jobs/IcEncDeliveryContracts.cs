using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Reserves immutable live candidates and records transfer outcomes in SQL; never used for synthetic sends.</summary>
public interface IIcEncDeliveryRepository
{
    /// <summary>Atomically reserves the exact current candidate and its outgoing file evidence.</summary>
    Task<IcEncDelivery?> ReserveAsync(string datasetName, ProductSpecification specification, int edition, int update, string jobId, DateTime nowUtc, CancellationToken cancellationToken);
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
public sealed record IcEncDelivery(Guid Id, string DatasetName, ProductSpecification Specification, int Edition, int Update, byte[] ExchangeSet);
