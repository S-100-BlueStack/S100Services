using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using ProductCatalogueAPI.Options;

namespace ProductCatalogueAPI.Contracts;

/// <summary>Reserves exports for a batch of changed bathymetric datasets.</summary>
/// <param name="ExportId">Caller-generated, stable identifier to reuse when reporting the same batch again.</param>
/// <param name="DatasetNames">Dataset names from the authoritative S-128 catalogue.</param>
public sealed record BathymetricChangeReport(Guid ExportId, [Required, MinLength(1), MaxLength(100)] string[] DatasetNames);

/// <summary>Supplies the output of one reserved bathymetric export as multipart form data.</summary>
public sealed class BathymetricExportCompletion
{
    /// <summary>Indicates whether the producer's validator passed the export.</summary>
    [Required]
    public bool? ValidationPassed { get; init; }

    /// <summary>Gets the exchange-set ZIP. Required when validation passes.</summary>
    public IFormFile? ExchangeSet { get; init; }

    /// <summary>Gets an optional VLD diagnostic from the producer's validator.</summary>
    public IFormFile? ValidationArtifact { get; init; }
}

/// <summary>Identifies the current workflow state for an externally generated product.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ExternalProductExportStatus>))]
public enum ExternalProductExportStatus
{
    /// <summary>No export has been reported for the catalogue dataset.</summary>
    Idle = 0,
    /// <summary>The producer is exporting the dataset.</summary>
    Exporting = 1,
    /// <summary>The producer completed the export with a failed validation result.</summary>
    Error = 2,
    /// <summary>The export has a validated exchange set available to submit.</summary>
    ReadyForDistribution = 3,
    /// <summary>The delivery worker has reserved the current export for a submission attempt.</summary>
    Sending = 4,
    /// <summary>The exchange set was handed off to IC-ENC, or the handoff was simulated.</summary>
    Submitted = 5,
    /// <summary>The transfer outcome needs reconciliation before another export or send.</summary>
    DeliveryNeedsReview = 6
}

/// <summary>Reports an external product export without returning binary artifacts.</summary>
/// <param name="DatasetName">Canonical S-128 dataset name.</param>
/// <param name="ExportId">Identifier of the export, or null before the first report.</param>
/// <param name="Edition">Reserved edition for this export, if known.</param>
/// <param name="Status">Current state of the dataset.</param>
/// <param name="UpdatedAtUtc">Last persisted workflow update in UTC.</param>
/// <param name="ValidationArtifactId">Optional VLD identifier for the existing validation artifact download endpoint.</param>
/// <param name="DeliveryId">Identifier of the active IC-ENC handoff, if any.</param>
/// <param name="DeliveryMode">Delivery mode recorded when a submission attempt began.</param>
public sealed record ExternalProductExportResponse(string DatasetName, Guid? ExportId, int? Edition, ExternalProductExportStatus Status,
    DateTime? UpdatedAtUtc, Guid? ValidationArtifactId, Guid? DeliveryId, SendToIcEncMode? DeliveryMode);

/// <summary>Identifies the accepted Hangfire submission request.</summary>
/// <param name="JobId">Identifier assigned by Hangfire.</param>
/// <param name="ExportId">Immutable export selected for this submission.</param>
public sealed record BathymetricSendResponse(string JobId, Guid ExportId);


/// <summary>Records an operator's confirmed receipt or confirmed absence at the bathymetric intake.</summary>
/// <param name="ReceivedByIcEnc">Whether the receiver confirmed possession of the exact delivery.</param>
public sealed record ReconcileBathymetricDeliveryRequest([Required] bool? ReceivedByIcEnc);
