using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ProductCatalogueAPI.Services.Export;

namespace ProductCatalogueAPI.Services.SevenCs
{
    public class SevenCsService : ISevenCsService
    {
        private readonly HttpClient client;
        private readonly ILogger<SevenCsService> _logger;
        private readonly Func<CancellationToken, Task> waitBeforeStatusPoll;

        public SevenCsService(ILogger<SevenCsService> logger)
            : this(logger, new HttpClient(), cancellationToken => Task.Delay(500, cancellationToken)) {
        }

        internal SevenCsService(ILogger<SevenCsService> logger, HttpClient httpClient, Func<CancellationToken, Task> waitBeforeStatusPoll) {
            _logger = logger;
            client = httpClient;
            this.waitBeforeStatusPoll = waitBeforeStatusPoll;
            client.BaseAddress ??= new Uri(@"https://sevencs.gst.dk:43222/api/");
            // Large cells can take arbitrarily long; the caller's token controls cancellation.
            client.Timeout = Timeout.InfiniteTimeSpan;
            client.DefaultRequestHeaders.Add("Accept-version", "1.5");
        }

        /// <summary>Uploads and validates one generated S-101 candidate.</summary>
        /// <remarks>Waits without a validation deadline until analysis completes, fails, or the caller cancels.</remarks>
        public async Task<SevenCsValidationResult> ValidateDatasetAsync(string datasetName, int edition, int update, string outputPath, CancellationToken cancellationToken = default) {
            // Build path
            var datasetPath = ExportOutputPath.GetS101DatasetFilesDirectory(outputPath, datasetName, edition, update);

            cancellationToken.ThrowIfCancellationRequested();

            _logger.LogInformation("SevenCs dataset validation begun. path: {path}", datasetPath);

            var uuid = Guid.NewGuid();

            // Figure out DSNM
            var dsnm = Directory.GetFiles(datasetPath, "*.000").Select(f => Path.GetFileNameWithoutExtension(f)).SingleOrDefault();

            _logger.LogInformation(".000 file detected. DSNM: {dsnm}", dsnm);
            if (string.IsNullOrEmpty(dsnm))
                throw new NullReferenceException($"Could not find .000 file in path: {datasetPath}");

            var directoryName = $"{dsnm}-{uuid}";
            var lastFile = "";
            var isAuthorized = await GetIsAuthorized(cancellationToken);

            if (!isAuthorized)
                await Authorize(cancellationToken);

            var uploadedFiles = new List<RequestObj>();


            var pattern = new Regex(@"\.\d{3}$", RegexOptions.Compiled);

            // Order each .000 file
            var orderedFiles = Directory
                .EnumerateFiles(datasetPath)
                .Where(file => {
                    var fileName = Path.GetFileName(file);
                    var extension = Path.GetExtension(fileName);
                    return fileName.StartsWith(dsnm, StringComparison.CurrentCultureIgnoreCase) && pattern.IsMatch(extension);
                })
                .OrderBy(file => {
                    var ext = Path.GetExtension(file).TrimStart('.'); // Remove the dot
                    return int.TryParse(ext, out int num) ? num : int.MaxValue;
                });

            // Upload each file in the correct order
            foreach (var file in orderedFiles) {
                var fileName = Path.GetFileName(file);

                var fileNameNoExtension = fileName.Split(".").FirstOrDefault()!;

                var requestObj = new RequestObj() {
                    DatasetName = fileName,
                    DirectoryName = directoryName,
                };

                // Upload file
                var uploaded = await UploadFile(requestObj, datasetPath, cancellationToken);

                if (uploaded)
                    uploadedFiles.Add(requestObj);
                else {
                    // Wait one second and retry once more
                    await Task.Delay(1000, cancellationToken);

                    var reUpload = await UploadFile(requestObj, datasetPath, cancellationToken);

                    if (!reUpload)
                        throw new Exception($"Could not upload file: {fileName}. Folderpath: {datasetPath}. FilesToUpload: {orderedFiles.Count()}");
                }

                // Retrieve the newest update for retrieving the summary
                lastFile = dsnm + Path.GetExtension(file);
            }

            if (uploadedFiles.Count == 0)
                throw new Exception("No files was uploaded to the SevenCs API");

            // Add files to analyzer queue
            await StartAnalysis(directoryName, [.. uploadedFiles.Select(e => e.DatasetName)], cancellationToken);

            await WaitForAnalysisAsync(directoryName, lastFile, cancellationToken);

            // Retrieve summary for the newest update
            var summary = await GetAnalysisSummary(directoryName, lastFile, cancellationToken);

            // set DSNM
            summary.DSNM = dsnm;

            _logger.LogInformation("Creating temp folder with uuid: {uuid}", uuid);
            var downloadPath = Path.Combine(AppContext.BaseDirectory, "SevenCsTemp", $"{uuid}");
            Directory.CreateDirectory(downloadPath);

            var diagnostics = new List<SevenCsDiagnosticArtifact>();

            // Diagnostic downloads must not hide an otherwise useful validation summary.
            // Each successfully downloaded file is persisted later with the candidate revision.
            try {
                diagnostics.Add(await GetAnalyzerShapefile(dsnm, directoryName, downloadPath, cancellationToken));
                ExtractZip(downloadPath);
                _logger.LogInformation("Extraction & cleanup finished!");
            }
            catch (Exception ex) when (ex is not OperationCanceledException) {
                _logger.LogWarning(ex, "SevenCs shapefile diagnostics could not be downloaded. DatasetName: {DatasetName}. DirectoryName: {DirectoryName}.", dsnm, directoryName);
            }

            SevenCsDiagnosticArtifact? validationLog = null;
            try {
                validationLog = await GetAnalyzerLogfile(dsnm, directoryName, downloadPath, cancellationToken);
                diagnostics.Add(validationLog);
            }
            catch (Exception ex) when (ex is not OperationCanceledException) {
                _logger.LogWarning(ex, "SevenCs VLD diagnostics could not be downloaded. DatasetName: {DatasetName}. DirectoryName: {DirectoryName}.", dsnm, directoryName);
            }

            // Cleanup results older than 1 hour
            foreach (var dir in Directory.GetDirectories(Path.Combine(AppContext.BaseDirectory, "SevenCsTemp"))) {
                try {
                    var dirInfo = new DirectoryInfo(dir);
                    if (dirInfo.CreationTimeUtc.AddHours(1) < DateTime.UtcNow) {
                        Directory.Delete(dirInfo.FullName, true);
                    }
                }
                catch (Exception ex) {
                    _logger.LogWarning("Could not delete old SevenCs temp folder: {folder}. Exception: {exception}", dir, ex);
                }
            }

            // If dataset is an update, check for ShallowIsolatedDangersUpdatedBathy.
            if (!lastFile.EndsWith(".000") && validationLog is not null)
                summary.ShallowIsolatedDangersUpdatedBathy = Encoding.UTF8.GetString(validationLog.Content).Contains("ShallowIsolatedDangersUpdatedBathy", StringComparison.Ordinal);

            _logger.LogInformation("SevenCs validation completed. Critical Errors found: {errors}", summary.Critical);

            return new SevenCsValidationResult(summary, diagnostics);
        }
        private async Task Authorize(CancellationToken cancellationToken) {
            var token = Environment.GetEnvironmentVariable("productcatalogue_7cs_credentials");
            if (string.IsNullOrEmpty(token)) {
                throw new Exception("Could not find environment variable for 'productcatalogue_7cs_credentials'");
            }

            token = Configuration.DecryptString(token);
            var credentials = token.Split("::");

            var obj = new {
                userId = credentials[0],
                password = credentials[1]
            };

            using var response = await client.PostAsJsonAsync("sign-in", obj, cancellationToken);

            var bearerToken = await response.Content.ReadAsStringAsync(cancellationToken) ?? string.Empty;

            if (!response.IsSuccessStatusCode || string.IsNullOrEmpty(bearerToken)) {
                throw new Exception($"Could not get bearertoken for SevenCs api. status code: {response.StatusCode}");
            }

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        }
        private async Task<bool> GetIsAuthorized(CancellationToken cancellationToken) {
            try {
                using var response = await client.GetAsync("test/expert-user", cancellationToken);

                return response.IsSuccessStatusCode;
            }
            catch (Exception ex) when (ex is not OperationCanceledException) {
                return false;
            }
        }
        private async Task<bool> UploadFile(RequestObj requestObj, string folderPath, CancellationToken cancellationToken) {
            var file = new FileInfo(Path.Combine(folderPath, requestObj.DatasetName));

            using var content = new MultipartFormDataContent();

            // Read the file's binary content
            var fileContent = new ByteArrayContent(await File.ReadAllBytesAsync(file.FullName, cancellationToken));
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

            using var multipartContent = new MultipartFormDataContent
            {
                // Add the file binary content
                { fileContent, "file", file.Name },
                { new StringContent(requestObj.DirectoryName), "directory-name" }
            };

            using var response = await client.PutAsync("dataset", multipartContent, cancellationToken);

            _logger.LogInformation($"File {file.Name} uploaded with status code: {response.StatusCode}");

            return response.IsSuccessStatusCode;

        }
        private async Task StartAnalysis(string directoryName, string[] datasets, CancellationToken cancellationToken) {
            using var form = new MultipartFormDataContent
                {
                    { new StringContent(directoryName), "directory-name" },
                };

            foreach (var val in datasets) {
                form.Add(new StringContent(val), "dataset-name");
            }

            using var response = await client.PostAsync("analyze", form, cancellationToken);
            response.EnsureSuccessStatusCode();
        }
        internal async Task WaitForAnalysisAsync(string directoryName, string datasetName, CancellationToken cancellationToken) {
            var queryParams = CreateQueryParameters(new Dictionary<string, string> {
                { "directory-name", directoryName },
                { "dataset-name", datasetName },
            });
            var elapsed = Stopwatch.StartNew();
            DatasetStatus? previousStatus = null;

            while (true) {
                cancellationToken.ThrowIfCancellationRequested();
                using var response = await client.GetAsync("dataset-status" + queryParams, cancellationToken);
                response.EnsureSuccessStatusCode();
                var statusText = (await response.Content.ReadAsStringAsync(cancellationToken)).Trim().Trim('"');
                if (!Enum.TryParse<DatasetStatus>(statusText, true, out var status) || !Enum.IsDefined(typeof(DatasetStatus), status))
                    throw new InvalidOperationException($"SevenCs returned an unknown analysis status. DatasetName: {datasetName}. DirectoryName: {directoryName}. Status: {statusText}");

                if (status != previousStatus) {
                    _logger.LogInformation("SevenCs analysis status. DatasetName: {DatasetName}. DirectoryName: {DirectoryName}. Status: {Status}. ElapsedSeconds: {ElapsedSeconds}.",
                        datasetName, directoryName, status, elapsed.Elapsed.TotalSeconds);
                    previousStatus = status;
                }

                switch (status) {
                    case DatasetStatus.Analyzed:
                        return;
                    case DatasetStatus.FailedToAnalyze:
                    case DatasetStatus.ProductSpecificationNotLicensed:
                        throw new InvalidOperationException($"SevenCs analysis failed. DatasetName: {datasetName}. DirectoryName: {directoryName}. Status: {status}.");
                    case DatasetStatus.Uploaded:
                    case DatasetStatus.PendingAnalysis:
                    case DatasetStatus.BeingAnalyzed:
                        break;
                }

                // Space out status requests without imposing a deadline on the analysis.
                await waitBeforeStatusPoll(cancellationToken);
            }
        }
        private async Task<SummaryResponse> GetAnalysisSummary(string directoryName, string datasetName, CancellationToken cancellationToken) {
            var dict = new Dictionary<string, string>()
            {
                {"directory-name", directoryName},
                {"dataset-name", datasetName}
            };

            var queryParams = CreateQueryParameters(dict);
            using var response = await client.GetAsync("analysis-summary" + queryParams, cancellationToken);

            response.EnsureSuccessStatusCode();

            var summary = await response.Content.ReadFromJsonAsync<SummaryResponse>(cancellationToken: cancellationToken);
            return summary ?? throw new InvalidOperationException("SevenCs returned an empty analysis summary.");
        }
        private async Task<SevenCsDiagnosticArtifact> GetAnalyzerLogfile(string datasetName, string directory, string folder, CancellationToken cancellationToken) {
            var dict = new Dictionary<string, string>()
            {
                {"directory-name", directory},
                {"analyzer-log-name", $"{datasetName}.vld"}
            };

            var queryParams = CreateQueryParameters(dict);

            using var response = await client.GetAsync("analyzer-log" + queryParams, cancellationToken);

            response.EnsureSuccessStatusCode();

            // Read the response content as a stream
            var content = await response.Content.ReadAsByteArrayAsync(cancellationToken);

            // Output path:
            Directory.CreateDirectory(folder);

            // Save the stream to a local file
            var fileName = $"{datasetName}.vld";
            await File.WriteAllBytesAsync(Path.Combine(folder, fileName), content, cancellationToken);
            return new SevenCsDiagnosticArtifact(fileName, "text/plain", content);
        }
        private async Task<SevenCsDiagnosticArtifact> GetAnalyzerShapefile(string datasetName, string directory, string folder, CancellationToken cancellationToken) {
            var dict = new Dictionary<string, string>()
            {
                {"directory-name", directory},
                {"analyzer-log-name", $"{datasetName}_vld"}
            };

            var queryParams = CreateQueryParameters(dict);

            using var response = await client.GetAsync("analyzer-shapefile-log" + queryParams, cancellationToken);

            response.EnsureSuccessStatusCode();

            // Read the response content as a stream
            var content = await response.Content.ReadAsByteArrayAsync(cancellationToken);

            // Output path:
            Directory.CreateDirectory(folder);

            // Save the stream to a local file
            var fileName = $"{datasetName}-validation-shapes.zip";
            await File.WriteAllBytesAsync(Path.Combine(folder, fileName), content, cancellationToken);
            return new SevenCsDiagnosticArtifact(fileName, "application/zip", content);
        }
        private static void ExtractZip(string folder) {
            var folderBasePath = new DirectoryInfo(folder);
            var zipToDelete = "";

            foreach (var dir in folderBasePath.GetFiles()) {
                if (dir.Extension != ".zip")
                    continue;

                var folderName = Path.GetFileNameWithoutExtension(dir.FullName);

                using var archive = ZipFile.OpenRead(dir.FullName);

                foreach (var entry in archive.Entries) {
                    // Combine extract path with the entry's file name
                    var destinationPath = Path.Combine(folder, entry.Name);

                    // Ensure the directory exists
                    Directory.CreateDirectory(Path.GetDirectoryName(destinationPath)!);

                    // Extract the file
                    entry.ExtractToFile(destinationPath, overwrite: true);
                }

                if (!string.IsNullOrEmpty(zipToDelete))
                    File.Delete(zipToDelete);

                zipToDelete = dir.FullName;
            }

            // Ensure last folder is deleted aswell
            if (!string.IsNullOrEmpty(zipToDelete))
                File.Delete(zipToDelete);

        }
        private static string CreateQueryParameters(IDictionary<string, string> queryParameters) {
            if (queryParameters == null || queryParameters.Count == 0) return string.Empty;

            return "?" + string.Join("&", queryParameters.Select(kvp => $"{kvp.Key}={kvp.Value}"));
        }

    }
    public enum DatasetStatus : int
    {
        Uploaded = 1,
        PendingAnalysis = 2,
        BeingAnalyzed = 3,
        Analyzed = 4,
        FailedToAnalyze = 5,
        ProductSpecificationNotLicensed = 6,
    }
    internal class RequestObj
    {
        [JsonPropertyName("dataset-name")]
        public string DatasetName { get; set; } = default!;

        [JsonPropertyName("directory-name")]
        public string DirectoryName { get; set; } = default!;

        public string GetAnalyzeLogShapefileName => DatasetName.Split(".").FirstOrDefault()! + "_vld";
    }
    public class SummaryResponse
    {
        [JsonPropertyName("numCritical")]
        public int Critical { get; set; }

        [JsonPropertyName("numErrors")]
        public int Errors { get; set; }

        [JsonPropertyName("numWarnings")]
        public int Warnings { get; set; }

        [JsonPropertyName("numInformation")]
        public int Information { get; set; }
        [JsonPropertyName("shallowIsolatedDangersUpdatedBathy")]
        public bool ShallowIsolatedDangersUpdatedBathy { get; set; }
        public string DSNM { get; set; } = default!;
    }
}
