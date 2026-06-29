using S100FC.S128.FeatureTypes;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace ProductManagerAPI.Services.SevenCs
{
    public class SevenCsService : ISevenCsService
    {
        private readonly HttpClient client;
        private readonly ILogger<SevenCsService> _logger;

        public SevenCsService(ILogger<SevenCsService> logger) {
            _logger = logger;
            client = new HttpClient() {
                BaseAddress = new Uri(@"https://sevencs.gst.dk:43222/api/"),
            };
            client.DefaultRequestHeaders.Add("Accept-version", "1.5");
        }

        /// <summary>Validates a dataset based on the publicationJob id.
        /// <para>
        /// Looks for publicationJobs in '\\nas.gst.dk\ncps\production\indigo\Jobs'. <br />
        /// Estimated run time per dataset: 10-12 seconds.
        /// </para>
        /// </summary>
        /// <returns>
        /// ValidateDatasetResult.Success - if there are no errors. <br />
        /// ValidateDatasetResult.HasCriticalErrors -  if there are critical errors <br />
        /// ValidateDatasetResult.IncorrectEdition -  if ShallowIsolatedDangersUpdatedBathy occurs in an update <br />
        /// ValidateDatasetResult.FailedToValidate -  if validation failed for any reason
        /// </returns>
        public async Task<SummaryResponse> ValidateDatasetAsync(ElectronicProduct product, string outputPath) {
            // Build path
            var datasetPath = Path.Combine(outputPath, product.datasetName, $"{product.editionNumber}", "S100_ROOT", "S-101", "DATASET_FILES");

            _logger.LogInformation("SevenCs dataset validation begun. path: {path}", datasetPath);

            var uuid = Guid.NewGuid();

            // Figure out DSNM
            var dsnm = Directory.GetFiles(datasetPath, "*.000").Select(f => Path.GetFileNameWithoutExtension(f)).SingleOrDefault();

            _logger.LogInformation(".000 file detected. DSNM: {dsnm}", dsnm);
            if (string.IsNullOrEmpty(dsnm))
                throw new NullReferenceException($"Could not find .000 file in path: {datasetPath}");

            var directoryName = $"{dsnm}-{uuid}";
            var lastFile = "";
            var isAuthorized = await GetIsAuthorized();

            if (!isAuthorized)
                await Authorize();

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
                var uploaded = await UploadFile(requestObj, datasetPath);

                if (uploaded)
                    uploadedFiles.Add(requestObj);
                else {
                    // Wait one second and retry once more
                    await Task.Delay(1000);

                    var reUpload = await UploadFile(requestObj, datasetPath);

                    if (!reUpload)
                        throw new Exception($"Could not upload file: {fileName}. Folderpath: {datasetPath}. FilesToUpload: {orderedFiles.Count()}");
                }

                // Retrieve the newest update for retrieving the summary
                lastFile = dsnm + Path.GetExtension(file);
            }

            if (uploadedFiles.Count == 0)
                throw new Exception("No files was uploaded to the SevenCs API");

            // Add files to analyzer queue
            await StartAnalysis(directoryName, [.. uploadedFiles.Select(e => e.DatasetName)]);

            var analyzed = await GetDatasetStatus(directoryName, lastFile, DatasetStatus.Analyzed);

            if (!analyzed) throw new Exception($"Dataset was unable to be analyzed. Dataset: {dsnm}. LastFile: {lastFile}. DirectoryName: {directoryName}");

            // Retrieve summary for the newest update
            var summary = await GetAnalysisSummary(directoryName, lastFile);

            // set DSNM
            summary.DSNM = dsnm;

            _logger.LogInformation("Creating temp folder with uuid: {uuid}", uuid);
            var downloadPath = Path.Combine(AppContext.BaseDirectory, "SevenCsTemp", $"{uuid}");
            Directory.CreateDirectory(downloadPath);

            // Download and extract shape.zip
            await GetAnalyzerShapefile(dsnm, directoryName, downloadPath);
            ExtractZip(downloadPath);
            _logger.LogInformation("Extraction & cleanup finished!");

            // Download .vld file
            await GetAnalyzerLogfile(dsnm, directoryName, downloadPath);

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
            if (!lastFile.EndsWith(".000")) {
                var content = System.IO.File.ReadAllText(Path.Combine(downloadPath, $"{dsnm}.vld"));
                summary.ShallowIsolatedDangersUpdatedBathy = content.Contains("ShallowIsolatedDangersUpdatedBathy");
            }

            _logger.LogInformation("SevenCs validation completed. Critical Errors found: {errors}", summary.Critical);

            return summary;
        }
        private async Task Authorize() {
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

            var response = await client.PostAsJsonAsync("sign-in", obj);

            var bearerToken = await response.Content.ReadAsStringAsync() ?? string.Empty;

            if (!response.IsSuccessStatusCode || string.IsNullOrEmpty(bearerToken)) {
                throw new Exception($"Could not get bearertoken for SevenCs api. status code: {response.StatusCode}");
            }

            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        }
        private async Task<bool> GetIsAuthorized() {
            try {
                var response = await client.GetAsync("test/expert-user");

                return response.IsSuccessStatusCode;
            }
            catch (Exception) {
                return false;
            }
        }
        private async Task<bool> UploadFile(RequestObj requestObj, string folderPath) {
            var file = new FileInfo(Path.Combine(folderPath, requestObj.DatasetName));

            using var content = new MultipartFormDataContent();

            // Read the file's binary content
            var fileContent = new ByteArrayContent(await File.ReadAllBytesAsync(file.FullName));
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");

            var multipartContent = new MultipartFormDataContent
            {
                // Add the file binary content
                { fileContent, "file", file.Name },
                { new StringContent(requestObj.DirectoryName), "directory-name" }
            };

            var response = await client.PutAsync("dataset", multipartContent);

            _logger.LogInformation($"File {file.Name} uploaded with status code: {response.StatusCode}");

            return response.IsSuccessStatusCode;

        }
        private async Task<bool> StartAnalysis(string directoryName, string[] datasets) {
            var form = new MultipartFormDataContent
                {
                    { new StringContent(directoryName), "directory-name" },
                };

            foreach (var val in datasets) {
                form.Add(new StringContent(val), "dataset-name");
            }

            var response = await client.PostAsync("analyze", form);

            return response.IsSuccessStatusCode;
        }
        private async Task<bool> GetDatasetStatus(string directoryName, string datasetName, DatasetStatus expectedStatus = DatasetStatus.Uploaded) {
            int i = 1;
            int maxAttemps = 120;    // Arbitrary. How long should the worst case scenario take? ~ 1minute per dataset
            while (maxAttemps >= i) {
                var dict = new Dictionary<string, string>()
                {
                    {"directory-name", directoryName},
                    {"dataset-name", datasetName}
                };

                var queryParams = CreateQueryParameters(dict);

                var response = await client.GetAsync("dataset-status" + queryParams);

                var content = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode && content.Trim('\"').Equals(expectedStatus.ToString(), StringComparison.CurrentCultureIgnoreCase))
                    return true;

                i++;

                // Hold your horses - avoid Timeout from API
                await Task.Delay(500);
            }
            return false;
        }
        private async Task<SummaryResponse> GetAnalysisSummary(string directoryName, string datasetName) {
            var dict = new Dictionary<string, string>()
            {
                {"directory-name", directoryName},
                {"dataset-name", datasetName}
            };

            var queryParams = CreateQueryParameters(dict);
            var response = await client.GetAsync("analysis-summary" + queryParams);

            response.EnsureSuccessStatusCode();

            var summary = await response.Content.ReadFromJsonAsync<SummaryResponse>();
            return summary;
        }
        private async Task GetAnalyzerLogfile(string datasetName, string directory, string folder) {
            var dict = new Dictionary<string, string>()
            {
                {"directory-name", directory},
                {"analyzer-log-name", $"{datasetName}.vld"}
            };

            var queryParams = CreateQueryParameters(dict);

            var response = await client.GetAsync("analyzer-log" + queryParams);

            response.EnsureSuccessStatusCode();

            // Read the response content as a stream
            using var responseStream = await response.Content.ReadAsStreamAsync();

            // Output path:
            Directory.CreateDirectory(folder);

            // Save the stream to a local file
            using var fileStream = new FileStream(Path.Combine(folder, $"{datasetName}.vld"), FileMode.Create, FileAccess.Write, FileShare.None, 4096, useAsync: true);

            await responseStream.CopyToAsync(fileStream);
        }
        private async Task GetAnalyzerShapefile(string datasetName, string directory, string folder) {
            var dict = new Dictionary<string, string>()
            {
                {"directory-name", directory},
                {"analyzer-log-name", $"{datasetName}_vld"}
            };

            var queryParams = CreateQueryParameters(dict);

            var response = await client.GetAsync("analyzer-shapefile-log" + queryParams);

            response.EnsureSuccessStatusCode();

            // Read the response content as a stream
            using var responseStream = await response.Content.ReadAsStreamAsync();

            // Output path:
            Directory.CreateDirectory(folder);

            // Save the stream to a local file
            using var fileStream = new FileStream(Path.Combine(folder, $"{datasetName}.zip"), FileMode.Create, FileAccess.Write, FileShare.None, 4096, useAsync: true);

            await responseStream.CopyToAsync(fileStream);
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
