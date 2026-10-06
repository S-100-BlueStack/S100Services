using FluentFTP;
using Microsoft.Extensions.Options;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Options;
using System.IO.Compression;
using System.Security.Authentication;

namespace ProductCatalogueAPI.Services.Jobs;

/// <summary>Uploads the immutable exchange set to a product-specific IC-ENC FTPS intake directory.</summary>
public interface IIcEncTransport
{
    Task<string> UploadAsync(IcEncDelivery delivery, CancellationToken cancellationToken);
}

public sealed class IcEncFtpsTransport(IOptionsMonitor<SendToIcEncOptions> options, ILogger<IcEncFtpsTransport> logger) : IIcEncTransport
{
    public Task<string> UploadAsync(IcEncDelivery delivery, CancellationToken cancellationToken) {
        var settings = options.CurrentValue;
        if (settings.Mode != SendToIcEncMode.Live)
            throw new InvalidOperationException("Live IC-ENC delivery is no longer configured.");

        // Extract only the exchange-set root. The S-57 build ZIP also contains working YAML.
        var root = delivery.Specification switch {
            ProductSpecification.S57 => "ENC_ROOT/",
            ProductSpecification.S101 => "S100_ROOT/",
            _ => throw new NotSupportedException("Only S-57 and S-101 exchange sets can be sent.")
        };
        var remoteRoot = delivery.Specification == ProductSpecification.S57 ? settings.S57RemoteRoot : settings.S101RemoteRoot;
        if (string.IsNullOrWhiteSpace(remoteRoot) || !remoteRoot.StartsWith('/') || remoteRoot.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("The IC-ENC remote intake directory is not configured.");
        if (delivery.DatasetName.Length is < 1 or > 100 || delivery.DatasetName.Any(ch => !char.IsAsciiLetterOrDigit(ch) && ch is not '_' and not '-'))
            throw new InvalidOperationException("The dataset name cannot be used as an IC-ENC remote path.");

        var target = $"{remoteRoot.TrimEnd('/')}/{delivery.DatasetName}_{delivery.Edition}_{delivery.Update:000}";
        var files = ReadExchangeSet(delivery.ExchangeSet, root);
        cancellationToken.ThrowIfCancellationRequested();
        logger.LogInformation("Starting IC-ENC transfer. Dataset: {DatasetName}. Product: {Specification}. RemoteDirectory: {RemoteDirectory}. DeliveryId: {DeliveryId}",
            delivery.DatasetName, delivery.Specification, target, delivery.Id);
        using var client = new FtpClient(settings.Host!, settings.Username!, settings.Password!);
        client.Port = settings.Port;
        client.Config.EncryptionMode = FtpEncryptionMode.Explicit;
        client.Config.DataConnectionEncryption = true;
        client.Config.SslProtocols = SslProtocols.Tls12 | SslProtocols.Tls13;
        // FluentFTP/.NET's normal certificate validation remains enabled.
        client.Connect();
        try {
            if (!client.DirectoryExists(remoteRoot))
                throw new IOException($"IC-ENC intake root does not exist: {remoteRoot}.");
            if (client.DirectoryExists(target))
                throw new InvalidOperationException($"IC-ENC directory already exists: {target}. Review the earlier delivery before sending again.");
            if (!client.CreateDirectory(target, true))
                throw new IOException($"Could not create IC-ENC delivery directory: {target}.");

            foreach (var file in files) {
                cancellationToken.ThrowIfCancellationRequested();
                var remotePath = $"{target}/{file.Path}";
                var status = client.UploadBytes(file.Content, remotePath, FtpRemoteExists.Skip, createRemoteDir: true);
                if (status != FtpStatus.Success || client.GetFileSize(remotePath) != file.Content.Length)
                    throw new IOException($"IC-ENC transfer or remote size check failed for {remotePath}.");
            }
            logger.LogInformation("IC-ENC exchange set uploaded. Dataset: {DatasetName}. Product: {Specification}. RemoteDirectory: {RemoteDirectory}. Files: {FileCount}",
                delivery.DatasetName, delivery.Specification, target, files.Count);
            return Task.FromResult(target);
        }
        finally {
            client.Disconnect();
        }
    }

    private static List<(string Path, byte[] Content)> ReadExchangeSet(byte[] zip, string root) {
        using var stream = new MemoryStream(zip, writable: false);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        var files = new List<(string Path, byte[] Content)>();
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in archive.Entries) {
            var name = entry.FullName.Replace('\\', '/');
            if (!name.StartsWith(root, StringComparison.OrdinalIgnoreCase) || name.EndsWith('/') || name.EndsWith(".vld", StringComparison.OrdinalIgnoreCase))
                continue;
            var relative = name[root.Length..];
            var parts = relative.Split('/');
            if (parts.Any(part => part is "" or "." or ".." || part.Contains(':')) || !names.Add(relative))
                throw new InvalidDataException("The exchange set contains an unsafe or duplicate path.");
            using var file = entry.Open();
            using var content = new MemoryStream();
            file.CopyTo(content);
            files.Add((relative, content.ToArray()));
        }
        if (files.Count == 0)
            throw new InvalidDataException($"The exchange set has no files under {root}.");
        return files;
    }
}
