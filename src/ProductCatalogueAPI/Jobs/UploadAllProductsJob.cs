using ArcGIS.Core.Data;
using FluentFTP;
using Hangfire.Common;
using Microsoft.Graph.Reports.GetPrinterArchivedPrintJobsWithPrinterIdWithStartDateTimeWithEndDateTime;
using ProductCatalogueAPI.Data.Repositories;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using Serilog.Core;
using Serilog.Extensions.Logging;
using System.Text.RegularExpressions;
using IO = System.IO;

namespace ProductCatalogueAPI.Jobs
{
    public class UploadAllProductsJob(IProductRepository repository, IProductManager productManager, ILogger<UploadAllProductsJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly IProductManager _productManager = productManager;
        private readonly ILogger<UploadAllProductsJob> _logger = logger;
        public async Task RunAsync(CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(UploadAllProductsJob));
            throw new NotImplementedException();

            // 1) Fetch all eligble products
            var products = await _repository.GetEligibleProductsAsync();

            foreach (var productName in products) {
                _logger.LogInformation("Uploading product: {productName}", productName);

                var electronicProduct = _productManager.ElectronicProductManager.ElectronicProduct(productName);

                if (electronicProduct == null) {
                    _logger.LogWarning("Failed to retrieve electronic product for {productName}. Skipping.", productName);
                    continue;
                }

                // 2) Begin upload process
                await PublishAsync(electronicProduct, _productManager.ElectronicProductManager.OutputFolder, token);


                // 3) Save new productstate
                _logger.LogInformation("Saving productstate");
                await _repository.AppendAsync(productName, Data.Models.ProductState.InTransit);



            }











       
            _logger.LogInformation("Job: {jobName} finished", nameof(UploadAllProductsJob));

        }

        public async Task<bool> PublishAsync(ElectronicProduct product, string outputPath, CancellationToken token) {

            try {
                bool isTechnical = false;

                var result = await UploadProductAsync(product, outputPath, token);
                if (!result)
                    return false;

                var path = ""; // ENC_PublicationJob.GetPendingPath(job.Series, dsnm);

                if (!IO.Directory.Exists(path))
                    IO.Directory.CreateDirectory(path);
                foreach (var e in IO.Directory.GetFiles(path).ToList()) {
                    IO.File.Delete(e);
                }

                var root = outputPath; 

                var folderExchangeSet = IO.Path.Combine(root, "ExchangeSet", product.datasetName, "ENC_ROOT");

                foreach (var f in IO.Directory.GetFiles(folderExchangeSet, "*.*", IO.SearchOption.TopDirectoryOnly)) {
                    switch (IO.Path.GetExtension(f).ToLowerInvariant()) {
                        case ".vld":
                            continue;
                    }
                    IO.File.Copy(f, IO.Path.Combine(path, IO.Path.GetFileName(f)));
                }

                return result;
            }
            catch (System.Exception ex) {
                _logger.LogError(ex, "Publish");
                return false;
            }
        }

        private async Task<bool> UploadProductAsync(ElectronicProduct product, string outputPath, CancellationToken token) {
            var dsnm = product.datasetName;

            _logger.LogInformation("Job: {jobName} uploading product {productName}", nameof(UploadAllProductsJob), product.datasetName);
            // 1) Fetch product details
            // 2) Upload to IC-ENC
            // 3) Update database record with new state and timestamp

            _logger.LogInformation("UploadFTP({dsnm})", dsnm);

            var root = outputPath;

            var folderExchangeSet = IO.Path.Combine(root, "ExchangeSet", dsnm);

            if (!IO.Directory.Exists(folderExchangeSet)) {
                _logger.LogWarning("ExchangeSet folder not found ({folder})!", folderExchangeSet);
                return false;
            }

            _logger.LogDebug("folder: {folder}", folderExchangeSet);

            try {
                var regex = new Regex(@"(?<edition>\d{3}$)", RegexOptions.IgnoreCase | RegexOptions.Singleline);

                var password = Configuration.DecryptString(Environment.GetEnvironmentVariable("cipher_ftp"));

                var host = "";
                var username = "";

                var loggerFactory = new SerilogLoggerFactory().CreateLogger($"FTP::{dsnm}");

                using var ftpClient = new FtpClient(host, username, password) {
                    //Logger = new FluentFTP.Logging.FtpLogAdapter(loggerFactory),

                };

                ftpClient.Config.EncryptionMode = FtpEncryptionMode.Explicit;
                ftpClient.Config.SslProtocols = System.Security.Authentication.SslProtocols.Tls12 | System.Security.Authentication.SslProtocols.Tls13;

                ftpClient.ValidateCertificate += (control, e) => {
                    e.Accept = true;
                };

                ftpClient.Connect();

                var folder = new IO.DirectoryInfo(IO.Path.Combine(IO.Path.GetFullPath(folderExchangeSet), "ENC_ROOT"));

                foreach (var f in IO.Directory.GetFiles(folderExchangeSet, "*.*", IO.SearchOption.TopDirectoryOnly).ToList()) {
                    switch (IO.Path.GetExtension(f).ToLowerInvariant()) {
                        case ".vld":
                            IO.File.Delete(f);
                            break;
                    }
                }

                // TEMP. Figure out if technical
                var isTechnical = false;

                var target = isTechnical ? $"/Upload/Reduced/S-57/{folder.Name}" : $"/Upload/S-57/{folder.Name}";

                var files = System.IO.Directory.GetFiles(folder.FullName, "*.*", IO.SearchOption.TopDirectoryOnly).Select(e => new System.IO.FileInfo(e)).Where(e => !e.Name.StartsWith("CATALOG.", StringComparison.CurrentCultureIgnoreCase) && regex.IsMatch(e.Extension));
                if (files.Any()) {
                    var sorted = files.OrderByDescending(e => e.Extension);
                    target = isTechnical ? $"/Upload/Reduced/S-57/{sorted.First().Name.Replace(".", "_")}" : $"/Upload/S-57/{sorted.First().Name.Replace(".", "_")}";
                }

                _logger.LogDebug("target: {target}", target);


                var result = ftpClient.UploadDirectory(
                    folder.FullName,
                    target,
                    FtpFolderSyncMode.Mirror,
                    FtpRemoteExists.Overwrite,
                    FtpVerify.OnlyVerify,
                    [
                        new FluentFTP.Rules.FtpFileExtensionRule(false, [
                            "vld",
                        ]),
                    ]);
                //(p) => {
                //    //_logger.LogInformation("#{index}: {file}", p.FileIndex, p.LocalPath);
                //});

                _logger.LogInformation("result={result}", result?.Any(s => !s.IsSuccess));

                if (result != null && result.Where(s => !s.IsSkippedByRule).Any(s => !s.IsSuccess)) {
                    _logger.LogError("FTP Upload failed: {@result}", result);

                    ftpClient.DeleteDirectory(target, FtpListOption.AllFiles);

                    return false;
                }
                return true;
            }
            catch (System.Exception ex) {
                _logger.LogError(ex, "UploadFTP");
                return false;
            }
            finally {

            }
        }

    }
}