using System.IO.Compression;
using System.Security.Authentication;
using FluentFTP;
using Hangfire;
using Hangfire.Server;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Options;
using ProductCatalogueAPI.Services.BathymetricSurfaces;
using ProductCatalogueAPI.Services.Distribution;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Submits one exact bathymetric export from the Hangfire worker.</summary>
/// <param name="repository">Reserves and records delivery independently of ENC.</param>
/// <param name="deliveryRepository">Records transfer outcomes in the shared IC-ENC delivery ledger.</param>
/// <param name="clock">Provides UTC outcome timestamps.</param>
/// <param name="options">Supplies the bathymetric FTPS intake and simulation profile.</param>
/// <param name="logger">Records delivery decisions without logging credentials or payloads.</param>
public sealed class SendBathymetricSurfaceJob(ProductExternalExportRepository repository, IIcEncDeliveryRepository deliveryRepository,
    TimeProvider clock, IOptionsMonitor<BathymetricSurfaceDeliveryOptions> options,
    ILogger<SendBathymetricSurfaceJob> logger)
{
    /// <summary>Claims the selected current export and submits its exchange set at most once without reconciliation.</summary>
    /// <param name="datasetName">Canonical bathymetric dataset name.</param>
    /// <param name="exportId">Exact ready export selected by the operator.</param>
    /// <param name="mode">Mode captured when the job was queued.</param>
    /// <param name="cancellationToken">Worker shutdown or job cancellation.</param>
    /// <param name="context">Worker-supplied context containing the durable Hangfire job identity.</param>
    /// <returns>A task that completes after a successful submission or when another invocation already claimed the export.</returns>
    /// <exception cref="InvalidOperationException">The delivery mode is unavailable or the attempt requires reconciliation.</exception>
    [AutomaticRetry(Attempts = 0, OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    public async Task RunAsync(string datasetName, Guid exportId, SendToIcEncMode mode, CancellationToken cancellationToken, PerformContext? context) {
        var jobId = context?.BackgroundJob.Id ?? throw new InvalidOperationException("A durable bathymetric send job is required.");
        var settings = options.CurrentValue;
        if (!settings.CanSend(mode))
            throw new InvalidOperationException("The queued bathymetric delivery mode is unavailable.");

        var delivery = await repository.ReserveDeliveryAsync(datasetName, BathymetricSurfaceService.Specification, exportId,
            jobId, mode == SendToIcEncMode.Simulation, cancellationToken);
        if (delivery is null) {
            logger.LogInformation("Bathymetric send skipped because the export is no longer ready. DatasetName: {DatasetName}. ExportId: {ExportId}.", datasetName, exportId);
            return;
        }

        try {
            if (mode == SendToIcEncMode.Live) {
                await UploadAsync(settings, delivery.DatasetName, delivery.Id, delivery.ExchangeSet, cancellationToken);
                await deliveryRepository.MarkDeliveredAsync(delivery.Id, clock.GetUtcNow().UtcDateTime, CancellationToken.None);
            }

            logger.LogInformation("Bathymetric exchange set submitted. DatasetName: {DatasetName}. ExportId: {ExportId}. DeliveryId: {DeliveryId}. Mode: {Mode}.",
                datasetName, exportId, delivery.Id, mode);
        }
        catch (Exception exception) {
            // The server may have moved the directory even if the response was lost. An automatic resend could duplicate submission.
            logger.LogWarning("Bathymetric submission requires review. DatasetName: {DatasetName}. ExportId: {ExportId}. DeliveryId: {DeliveryId}. FailureType: {FailureType}.",
                datasetName, exportId, delivery.Id, exception.GetType().Name);
            try {
                await deliveryRepository.MarkUncertainAsync(delivery.Id, clock.GetUtcNow().UtcDateTime,
                    "The bathymetric transfer outcome requires reconciliation.", CancellationToken.None);
            }
            catch (Exception recordingFailure) {
                logger.LogWarning("Could not record the uncertain bathymetric submission. DeliveryId: {DeliveryId}. FailureType: {FailureType}.",
                    delivery.Id, recordingFailure.GetType().Name);
            }
            if (exception is OperationCanceledException && cancellationToken.IsCancellationRequested)
                cancellationToken.ThrowIfCancellationRequested();
            throw new InvalidOperationException("The bathymetric submission needs reconciliation before it can be sent again.");
        }
    }

    /// <summary>Stages a complete exchange set outside the intake and promotes it after verifying file sizes.</summary>
    /// <param name="settings">Validated bathymetric FTPS profile.</param>
    /// <param name="datasetName">Dataset used to verify the archive identity and construct the remote path.</param>
    /// <param name="deliveryId">Durable submission identifier used in remote paths.</param>
    /// <param name="exchangeSet">ZIP produced and validated by the external export process.</param>
    /// <param name="token">Cancels network operations and entry reads.</param>
    /// <returns>A task that completes once the server reports that promotion succeeded.</returns>
    /// <exception cref="IOException">The staging or intake directory is unavailable, or transfer verification fails.</exception>
    private static async Task UploadAsync(BathymetricSurfaceDeliveryOptions settings, string datasetName, Guid deliveryId, byte[] exchangeSet, CancellationToken token) {
        if (!BathymetricSurfaceService.IsDatasetName(datasetName))
            throw new InvalidDataException("The dataset name cannot be used as an FTP path.");
        using var stream = new MemoryStream(exchangeSet, writable: false);
        using var zip = new ZipArchive(stream, ZipArchiveMode.Read);
        var files = BathymetricExchangeSet.GetFiles(zip, datasetName);

        var directory = $"{datasetName}_{deliveryId:N}";
        var stagingPath = $"{settings.StagingRoot}/{directory}";
        var targetPath = $"{settings.IntakeRoot}/{directory}";
        using var client = new AsyncFtpClient(settings.Host!, settings.Username!, settings.Password!, settings.Port);
        client.Config.EncryptionMode = FtpEncryptionMode.Explicit;
        client.Config.DataConnectionEncryption = true;
        client.Config.SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
        await client.Connect(token);

        if (!await client.DirectoryExists(settings.StagingRoot!, token) || !await client.DirectoryExists(settings.IntakeRoot!, token)
            || await client.DirectoryExists(stagingPath, token) || await client.DirectoryExists(targetPath, token)
            || !await client.CreateDirectory(stagingPath, false, token))
            throw new IOException("The bathymetric FTPS staging or intake path is unavailable.");

        foreach (var file in files) {
            // FluentFTP needs a known length. Read into a bounded seekable buffer after the aggregate ZIP size check.
            var bytes = new byte[(int)file.Length];
            using var entry = file.Open();
            await entry.ReadExactlyAsync(bytes, token);
            if (entry.ReadByte() != -1)
                throw new InvalidDataException("An exchange-set entry exceeds its declared length.");

            var remotePath = $"{stagingPath}/{file.FullName}";
            var status = await client.UploadBytes(bytes, remotePath, FtpRemoteExists.Skip, true, token: token);
            if (status != FtpStatus.Success || await client.GetFileSize(remotePath, token: token) != file.Length)
                throw new IOException("A bathymetric exchange-set file could not be verified after transfer.");
        }

        if (!await client.MoveDirectory(stagingPath, targetPath, FtpRemoteExists.Skip, token))
            throw new IOException("The bathymetric exchange set could not be promoted to the intake.");
    }
}
