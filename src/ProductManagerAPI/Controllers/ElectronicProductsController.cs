using Azure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ProductManagerAPI.Data.Models;
using ProductManagerAPI.Data.Repositories;
using ProductManagerAPI.Models;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using S100FC.S128.SimpleAttributes;
using System.Diagnostics;
using System.Globalization;
using System.Text.Json;
using static ProductManagerAPI.Models.RequestTypes;
using static ProductManagerAPI.Models.ResponseTypes;

namespace ProductManagerAPI.Controllers
{
    [AllowAnonymous]
    //[Authorize("productmanager:access")]
    [ApiController]
    [Route("[controller]")]
    public class ElectronicProductsController(
        ILogger<ElectronicProductsController> logger,
        IMemoryCache cache,
        IProductManager productManager,
        IProductRepository repository) : ControllerBase
    {
        private readonly ILogger<ElectronicProductsController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IMemoryCache _cache = cache;
        private readonly IProductRepository _repository = repository;

        /// <summary>
        /// Get all product names in the database.
        /// </summary>
        /// <returns>An collection with all productnames.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet(Name = "GetAllElectronicProducts")]
        public IActionResult GetAllElectronicProducts()
        {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<object>();
            var productNames = this._electronicProductManager.ToArray();

            response.Data = productNames;
            response.TotalHits = productNames.Length;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        /// <summary>
        /// Get all product AOIs in the database as ESRI json feature collection.
        /// </summary>
        /// <returns>An ESRI json feature collection for all product AOIs.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("aoi")]
        public async Task<IActionResult> GetAllElectronicProductsAOI()
        {
            var controllerStopwatch = Stopwatch.StartNew();
            var geometryRetrievalStopwatch = new Stopwatch();
            var productStateRetrievalStopwatch = new Stopwatch();
            var mappingStopwatch = new Stopwatch();
            var requestId = HttpContext.TraceIdentifier;
            var correlationId = Activity.Current?.TraceId.ToString() ?? requestId;
            var repositoryCallCount = 0;
            var productCount = 0;
            var geometryCount = 0;
            var responseItemCount = 0;
            var skippedProductCount = 0;
            var succeeded = false;

            try
            {
                Dictionary<string, string> aois;

                geometryRetrievalStopwatch.Start();
                try
                {
                    aois = await _electronicProductManager.GetDatasetAOIs();
                }
                finally
                {
                    geometryRetrievalStopwatch.Stop();
                }

                productCount = aois.Count;
                geometryCount = aois.Count;

                mappingStopwatch.Start();
                var mappedProducts = new List<(string DatasetName, string Geometry, ElectronicProduct Product)>(aois.Count);

                foreach (var aoi in aois)
                {
                    var electronicProduct = _electronicProductManager.ElectronicProduct(aoi.Key);

                    if (electronicProduct == null)
                    {
                        skippedProductCount++;
                        _logger.LogWarning(
                            "No electronic product found for dataset {DatasetName}. RequestId: {RequestId}. CorrelationId: {CorrelationId}",
                            aoi.Key,
                            requestId,
                            correlationId
                        );
                        continue;
                    }

                    mappedProducts.Add((aoi.Key, aoi.Value, electronicProduct));
                }

                mappingStopwatch.Stop();

                var currentProductsByName = new Dictionary<string, ProductRecord>(StringComparer.OrdinalIgnoreCase);

                if (mappedProducts.Count > 0)
                {
                    repositoryCallCount = 1;
                    IEnumerable<ProductRecord> currentProducts;

                    productStateRetrievalStopwatch.Start();
                    try
                    {
                        currentProducts = await _repository.GetCurrentByNamesAsync(
                            mappedProducts.Select(product => product.DatasetName)
                        );
                    }
                    finally
                    {
                        productStateRetrievalStopwatch.Stop();
                    }

                    mappingStopwatch.Start();
                    foreach (var currentProduct in currentProducts)
                    {
                        currentProductsByName[currentProduct.Name] = currentProduct;
                    }
                    mappingStopwatch.Stop();
                }

                var responses = new List<AOIResponse>(mappedProducts.Count);

                mappingStopwatch.Start();
                foreach (var mappedProduct in mappedProducts)
                {
                    currentProductsByName.TryGetValue(mappedProduct.DatasetName, out var current);

                    responses.Add(new AOIResponse
                    {
                        Geometry = mappedProduct.Geometry,
                        // JsonSerializer.Deserialize(polygon),
                        Attributes = new Attributes
                        {
                            DatasetName = mappedProduct.Product.datasetName,
                            Status = Enum.Parse<ProductStatus>((current?.State ?? ProductState.Idle).ToString()),
                            // If no explicit state defined in JobTable, default to Ready,
                            DisplayScale = mappedProduct.Product.optimumDisplayScale,
                            UsageBand = mappedProduct.Product.specificUsage
                        }
                    });
                }
                mappingStopwatch.Stop();

                responseItemCount = responses.Count;
                succeeded = true;

                return Ok(responses);
            }
            finally
            {
                controllerStopwatch.Stop();

                _logger.LogInformation(
                    "AOI controller profiling completed. RequestId: {RequestId}. CorrelationId: {CorrelationId}. Success: {Success}. ControllerDurationMs: {ControllerDurationMs}. GeometryRetrievalMs: {GeometryRetrievalMs}. ProductStateRetrievalMs: {ProductStateRetrievalMs}. MappingMs: {MappingMs}. RepositoryCallCount: {RepositoryCallCount}. ProductCount: {ProductCount}. GeometryCount: {GeometryCount}. ResponseItemCount: {ResponseItemCount}. SkippedProductCount: {SkippedProductCount}. CacheState: {CacheState}",
                    requestId,
                    correlationId,
                    succeeded,
                    controllerStopwatch.Elapsed.TotalMilliseconds,
                    geometryRetrievalStopwatch.Elapsed.TotalMilliseconds,
                    productStateRetrievalStopwatch.Elapsed.TotalMilliseconds,
                    mappingStopwatch.Elapsed.TotalMilliseconds,
                    repositoryCallCount,
                    productCount,
                    geometryCount,
                    responseItemCount,
                    skippedProductCount,
                    "None"
                );
            }
        }

        /// <summary>
        /// Get a specific electronic product.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}", Name = "GetElectronicProduct")]
        public async Task<IActionResult> GetElectronicProduct(string name)
        {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<ProductResponse>();
            var electronicProduct = this._electronicProductManager.ElectronicProduct(name);

            if (electronicProduct == null)
            {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var current = await _repository.GetCurrentByNameAsync(name);
            // var s57current = await _repository.GetCurrentByNameAsync(s57product.datasetName);
            var s128Status = Enum.Parse<ProductStatus>((current?.State ?? ProductState.Idle).ToString());
            // var s57Status = Enum.Parse((s57current?.State ?? Data.Models.ProductState.Idle).ToString());

            var product = new ProductResponse
            {
                IssueDate = electronicProduct.issueDate,
                Name = electronicProduct.datasetName,
                Edition = electronicProduct.editionNumber,
                Update = electronicProduct.updateNumber,
                UsageBand = electronicProduct.specificUsage,
                Status = s128Status,
                Exports = [
                    //new(s57product.productSpecification.name, s57product.datasetName, s57product.editionNumber.Value, s57product.updateNumber, s57Status, s57current.Date_From)
                    //new("S-57", electronicProduct.datasetName.Replace("101DK00", "DK"), electronicProduct.editionNumber.Value, electronicProduct.updateNumber, s128Status, electronicProduct.issueDate.Value.ToDateTime(TimeOnly.MinValue))
                ]
            };

            response.Data = product;
            response.TotalHits = 1;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        /// <summary>
        /// Get a specific electronic product's AOI.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product's AOI.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}/aoi", Name = "GetElectronicProductAoi")]
        public async Task<IActionResult> GetElectronicProductAoi(string name)
        {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<AOIResponse>();
            var electronicProduct = this._electronicProductManager.ElectronicProduct(name);

            if (electronicProduct == null)
            {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var boundary = await _electronicProductManager.GetDatasetBoundary(name);

            if (boundary.IsNullOrEmpty())
            {
                response.Success = false;
                response.Message = $"No AOI could be found for electronic product with name '{name}'";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var current = await _repository.GetCurrentByNameAsync(name);

            var aoiResponse = new AOIResponse
            {
                Geometry = boundary,
                Attributes = new Attributes
                {
                    DatasetName = electronicProduct.datasetName,
                    Status = Enum.Parse<ProductStatus>((current?.State ?? ProductState.Idle).ToString()),
                    // If no explicit state defined in JobTable, default to Idle,
                    DisplayScale = electronicProduct.optimumDisplayScale,
                    UsageBand = electronicProduct.specificUsage,
                    Edition = electronicProduct.editionNumber,
                    Update = electronicProduct.updateNumber,
                    IssueDate = electronicProduct.issueDate,
                }
            };

            response.Data = aoiResponse;
            response.TotalHits = 1;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        /// <summary>
        /// Creates a new Electronic Product in the S-128 database.
        /// </summary>
        /// <remarks>
        /// The request payload containing the dataset boundary (AOI) and usage band.
        /// The aoi should be provided in ArcGIS JSON geometry format.
        /// </remarks>
        [ProducesResponseType(StatusCodes.Status501NotImplemented)]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        //[ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpPost()]
        //[Authorize("productmanager:manage")]
        public async Task<IActionResult> CreateElectronicProduct([FromBody] CreateProductRequest product)
        {
            return StatusCode(StatusCodes.Status501NotImplemented);

#pragma warning disable CS0162 // Unreachable code is kept because this endpoint is intentionally parked.
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse();

            if (_electronicProductManager.ElectronicProduct(product.Name) != null)
            {
                response.Success = false;
                response.Message = $"An electronic product with name '{product.Name}' already exists.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return StatusCode(StatusCodes.Status404NotFound, response);
            }

            //var boundary = GetBoundaryFromGeoJSON(aoi);
            //var boundary = NetTopologySuite.Geometries.Polygon.FromJson(product.Aoi.ToString());
            var boundary = product.Aoi.ToString();
            _electronicProductManager.ElectronicProduct(product.Name); // check if product already exists, if not, will return null

            var productSpecification = new S100FC.S128.ComplexAttributes.productSpecification()
            {
                name = "S-101",
                version = "2.0.0",
                editionDate = DateOnly.FromDateTime(DateTime.Today)
            };

            var specificUsage = product.UsageBand switch
            {
                SpecificUsage.NavigationalPurposeOverview => 1, // S100FC.S128.specificUsage.NavigationalPurposeOverview,
                SpecificUsage.NavigationalPurposeGeneral => 2, //S100FC.S128.specificUsage.NavigationalPurposeGeneral,
                SpecificUsage.NavigationalPurposeCoastal => 3, //S100FC.S128.specificUsage.NavigationalPurposeCoastal,
                SpecificUsage.NavigationalPurposeApproach => 4, //S100FC.S128.specificUsage.NavigationalPurposeApproach,
                SpecificUsage.NavigationalPurposeHarbour => 5, //S100FC.S128.specificUsage.NavigationalPurposeHarbour,
                SpecificUsage.NavigationalPurposeBerthing => 6, //S100FC.S128.specificUsage.NavigationalPurposeBerthing,
                _ => throw new ArgumentNullException(),
            };

            // Todo: change argument to AOI and do arcgis core geometry conversion in productmanager
            await _electronicProductManager.CreateElectronicProductAsync(
                product.Name,
                productSpecification,
                specificUsage,
                boundary,
                "",
                product.OptimumDisplayScale);

            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
#pragma warning restore CS0162
        }

        /// <summary>
        /// Get operational dashboard activity for electronic products within the selected Danish time range.
        /// </summary>
        /// <param name="from">Required Danish date or date-time. A date-only value is treated as start of day in Europe/Copenhagen.</param>
        /// <param name="to">Optional Danish date or date-time. A date-only value is treated as the next day exclusive in Europe/Copenhagen.</param>
        /// <returns>Dashboard summary and activity rows derived from JobTable history.</returns>
        [ProducesResponseType(typeof(ApiResponse<DashboardResponse>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("dashboard", Name = "GetElectronicProductsDashboard")]
        public async Task<IActionResult> GetElectronicProductsDashboard(
            [FromQuery] string? from,
            [FromQuery] string? to = null)
        {
            var sw = Stopwatch.StartNew();

            if (!TryCreateDashboardRange(
                from,
                to,
                out var fromDanishTime,
                out var toDanishTime,
                out var fromDatabaseTime,
                out var toDatabaseTime,
                out var validationMessage))
            {
                return BadRequest(new ApiResponse
                {
                    Success = false,
                    Message = validationMessage,
                    DurationMs = sw.ElapsedMilliseconds
                });
            }

            var rows = (await _repository.GetHistoryAsync(fromDatabaseTime, toDatabaseTime)).ToArray();
            var activities = rows.Select(ToDashboardActivity).ToList();
            var responseData = CreateDashboardResponse(fromDanishTime, toDanishTime, activities);

            var response = new ApiResponse<DashboardResponse>
            {
                Data = responseData,
                TotalHits = activities.Count,
                DurationMs = sw.ElapsedMilliseconds
            };

            return Ok(response);
        }

        /// <summary>
        /// Get the history of a specific electronic product.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}/history", Name = "GetElectronicProductHistory")]
        public async Task<IActionResult> GetElectronicProductHistory(string name)
        {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<ProductHistoryResponse[]>();
            var electronicProduct = this._electronicProductManager.ElectronicProduct(name);

            if (electronicProduct == null)
            {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var rows = await _repository.GetHistoryByNameAsync(name);
            var historyRows = rows.ToArray();

            response.Data = [
                .. historyRows.Select(r => new ProductHistoryResponse
                {
                    Name = r.Name,
                    Edition = r.EditionNo,
                    Update = r.UpdateNo,
                    Status = Enum.Parse<ProductStatus>(r.State.ToString()),
                    From = r.Date_From,
                    To = r.Date_to,
                    Owner = TrimUsername(r.Owner)
                })
            ];
            response.TotalHits = historyRows.Length;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        private static DashboardResponse CreateDashboardResponse(
            DateTimeOffset fromDanishTime,
            DateTimeOffset toDanishTime,
            IReadOnlyCollection<DashboardActivityResponse> activities)
        {
            return new DashboardResponse
            {
                GeneratedAt = GetDashboardNow(),
                Range = new DashboardRangeResponse
                {
                    From = fromDanishTime,
                    To = toDanishTime,
                    TimeZone = DashboardTimeZoneId
                },
                Summary = new DashboardSummaryResponse
                {
                    TotalActivities = activities.Count,
                    ProductsTouched = activities
                        .Select(activity => activity.DatasetName)
                        .Where(name => !string.IsNullOrWhiteSpace(name))
                        .Distinct(StringComparer.OrdinalIgnoreCase)
                        .Count(),
                    ImportantChanges = activities.Count(IsImportantDashboardActivity),
                    FailedOperations = activities.Count(activity => activity.Status == "failed"),
                    ReportsAvailable = activities.Sum(activity =>
                        activity.Links.IcEncReports.Count + activity.Links.InternalValidationReports.Count)
                },
                StatusSummary = [
                    .. activities
                        .GroupBy(activity => activity.Status)
                        .OrderBy(group => GetDashboardStatusSortOrder(group.Key))
                        .ThenBy(group => group.Key)
                        .Select(group => new DashboardStatusSummaryItemResponse
                        {
                            Status = group.Key,
                            Count = group.Count()
                        })
                ],
                OperationSummary = [
                    .. activities
                        .GroupBy(activity => activity.Type)
                        .OrderBy(group => group.Key)
                        .Select(group => new DashboardOperationSummaryItemResponse
                        {
                            Type = group.Key,
                            Count = group.Count(),
                            Failed = group.Count(activity => activity.Status == "failed")
                        })
                ],
                Activities = [.. activities.OrderByDescending(activity => activity.Timestamp)]
            };
        }

        private static DashboardActivityResponse ToDashboardActivity(ProductRecord record)
        {
            var metadata = GetDashboardActivityMetadata(record.State);
            var hasDatasetName = !string.IsNullOrWhiteSpace(record.Name);

            return new DashboardActivityResponse
            {
                Id = CreateDashboardActivityId(record),
                Timestamp = ConvertDatabaseTimeToDashboardTime(record.Date_From),
                DatasetName = record.Name,
                ProductName = record.Name,
                Type = metadata.Type,
                Severity = metadata.Severity,
                Title = metadata.Title,
                Description = metadata.Description,
                Status = metadata.Status,
                Actor = TrimUsername(record.Owner),
                Edition = record.EditionNo,
                Update = record.UpdateNo,
                Links = new DashboardActivityLinksResponse
                {
                    Review = hasDatasetName,
                    Analyze = hasDatasetName,
                    History = hasDatasetName,
                    IcEncReports = [],
                    InternalValidationReports = []
                },
                Details = CreateDashboardActivityDetails(record)
            };
        }

        private static List<DashboardActivityDetailResponse> CreateDashboardActivityDetails(ProductRecord record)
        {
            var details = new List<DashboardActivityDetailResponse>
            {
                new() { Label = "Product specification", Value = record.ProductSpecification },
                new() { Label = "Source state", Value = record.State.ToString() },
                new() { Label = "Edition", Value = record.EditionNo.ToString(CultureInfo.InvariantCulture) },
                new() { Label = "Update", Value = record.UpdateNo.ToString(CultureInfo.InvariantCulture) }
            };

            var owner = TrimUsername(record.Owner);

            if (!string.IsNullOrWhiteSpace(owner))
            {
                details.Add(new DashboardActivityDetailResponse { Label = "Owner", Value = owner });
            }

            return details;
        }

        private static DashboardActivityMetadata GetDashboardActivityMetadata(ProductState state)
        {
            return state switch
            {
                ProductState.Exported => new DashboardActivityMetadata(
                    Type: "export",
                    Severity: "normal",
                    Status: "completed",
                    Title: "Export completed",
                    Description: "The product export was completed."),

                ProductState.Frozen => new DashboardActivityMetadata(
                    Type: "freeze",
                    Severity: "important",
                    Status: "active",
                    Title: "Product frozen",
                    Description: "The product is frozen and awaits manual handling."),

                ProductState.InTransit => new DashboardActivityMetadata(
                    Type: "send",
                    Severity: "normal",
                    Status: "active",
                    Title: "Sent to IC-ENC",
                    Description: "The product has been sent and is awaiting IC-ENC follow-up."),

                ProductState.Rejected => new DashboardActivityMetadata(
                    Type: "validation",
                    Severity: "critical",
                    Status: "failed",
                    Title: "Validation failed",
                    Description: "The product was rejected by IC-ENC and needs follow-up."),

                ProductState.Idle => new DashboardActivityMetadata(
                    Type: "lifecycle",
                    Severity: "normal",
                    Status: "idle",
                    Title: "Product idle",
                    Description: "The product has no active operation state."),

                _ => new DashboardActivityMetadata(
                    Type: "activity",
                    Severity: "normal",
                    Status: "completed",
                    Title: "Product activity recorded",
                    Description: "A product state change was recorded.")
            };
        }

        private static int GetDashboardStatusSortOrder(string status)
        {
            return status switch
            {
                "failed" => 0,
                "active" => 1,
                "completed" => 2,
                "idle" => 3,
                _ => 4
            };
        }

        private static bool IsImportantDashboardActivity(DashboardActivityResponse activity)
        {
            return activity.Severity is "important" or "critical" or "warning"
                || activity.Status is "failed" or "error" or "rejected";
        }

        private static string CreateDashboardActivityId(ProductRecord record)
        {
            if (record.Id != Guid.Empty)
            {
                return record.Id.ToString("N");
            }

            return string.Join(
                    "-",
                    "dashboard",
                    record.Name,
                    TreatDatabaseTimeAsUtc(record.Date_From).ToString("yyyyMMddHHmmss", CultureInfo.InvariantCulture),
                    record.State)
                .Replace(" ", "-", StringComparison.Ordinal);
        }

        private const string DashboardTimeZoneId = "Europe/Copenhagen";
        private static readonly Lazy<TimeZoneInfo> DashboardTimeZone = new(ResolveDashboardTimeZone);

        private static bool TryCreateDashboardRange(
            string? from,
            string? to,
            out DateTimeOffset fromDanishTime,
            out DateTimeOffset toDanishTime,
            out DateTime fromDatabaseTime,
            out DateTime toDatabaseTime,
            out string? validationMessage)
        {
            fromDanishTime = default;
            toDanishTime = default;
            fromDatabaseTime = default;
            toDatabaseTime = default;
            validationMessage = null;

            if (string.IsNullOrWhiteSpace(from))
            {
                validationMessage = "The 'from' query parameter is required.";
                return false;
            }

            if (!TryParseDashboardDate(from, isRangeEnd: false, out fromDanishTime, out validationMessage))
            {
                return false;
            }

            if (string.IsNullOrWhiteSpace(to))
            {
                toDanishTime = GetDashboardNow();
            }
            else if (!TryParseDashboardDate(to, isRangeEnd: true, out toDanishTime, out validationMessage))
            {
                return false;
            }

            // JobTable currently stores date_from/date_to as UTC instants from AppendAsync.
            // The API boundary remains Danish time, while the repository boundary uses the persisted instant for correct filtering.
            fromDatabaseTime = fromDanishTime.UtcDateTime;
            toDatabaseTime = toDanishTime.UtcDateTime;

            if (toDatabaseTime <= fromDatabaseTime)
            {
                validationMessage = "The 'to' query parameter must be later than 'from'.";
                return false;
            }

            return true;
        }

        private static bool TryParseDashboardDate(
            string value,
            bool isRangeEnd,
            out DateTimeOffset danishValue,
            out string? validationMessage)
        {
            var trimmedValue = value.Trim();
            danishValue = default;
            validationMessage = null;

            if (DateOnly.TryParseExact(
                trimmedValue,
                "yyyy-MM-dd",
                CultureInfo.InvariantCulture,
                DateTimeStyles.None,
                out var dateOnly))
            {
                var localDateTime = dateOnly.ToDateTime(TimeOnly.MinValue);

                if (isRangeEnd)
                {
                    localDateTime = localDateTime.AddDays(1);
                }

                return TryCreateDanishDateTimeOffset(localDateTime, value, out danishValue, out validationMessage);
            }

            if (HasExplicitTimeZoneOffset(trimmedValue))
            {
                if (DateTimeOffset.TryParse(
                    trimmedValue,
                    CultureInfo.InvariantCulture,
                    DateTimeStyles.AllowWhiteSpaces,
                    out var dateTimeOffset))
                {
                    danishValue = TimeZoneInfo.ConvertTime(dateTimeOffset, DashboardTimeZone.Value);
                    return true;
                }

                validationMessage = $"The date value '{value}' is invalid. Use yyyy-MM-dd, a Danish local date-time, or an ISO 8601 date-time with offset.";
                return false;
            }

            if (DateTime.TryParse(
                trimmedValue,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AllowWhiteSpaces,
                out var localDateTimeValue))
            {
                return TryCreateDanishDateTimeOffset(localDateTimeValue, value, out danishValue, out validationMessage);
            }

            validationMessage = $"The date value '{value}' is invalid. Use yyyy-MM-dd, a Danish local date-time, or an ISO 8601 date-time with offset.";
            return false;
        }

        private static bool TryCreateDanishDateTimeOffset(
            DateTime localDateTime,
            string originalValue,
            out DateTimeOffset danishValue,
            out string? validationMessage)
        {
            var unspecifiedLocalTime = DateTime.SpecifyKind(localDateTime, DateTimeKind.Unspecified);
            var timeZone = DashboardTimeZone.Value;
            danishValue = default;
            validationMessage = null;

            if (timeZone.IsInvalidTime(unspecifiedLocalTime))
            {
                validationMessage = $"The date value '{originalValue}' does not exist in {DashboardTimeZoneId} because of daylight saving time.";
                return false;
            }

            danishValue = new DateTimeOffset(unspecifiedLocalTime, timeZone.GetUtcOffset(unspecifiedLocalTime));
            return true;
        }

        private static DateTimeOffset ConvertDatabaseTimeToDashboardTime(DateTime databaseDateTime)
        {
            var utcDateTime = TreatDatabaseTimeAsUtc(databaseDateTime);
            return TimeZoneInfo.ConvertTime(new DateTimeOffset(utcDateTime), DashboardTimeZone.Value);
        }

        private static DateTime TreatDatabaseTimeAsUtc(DateTime dateTime)
        {
            return dateTime.Kind switch
            {
                DateTimeKind.Utc => dateTime,
                DateTimeKind.Local => dateTime.ToUniversalTime(),
                _ => DateTime.SpecifyKind(dateTime, DateTimeKind.Utc)
            };
        }

        private static DateTimeOffset GetDashboardNow()
        {
            return TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, DashboardTimeZone.Value);
        }

        private static TimeZoneInfo ResolveDashboardTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(DashboardTimeZoneId);
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time");
            }
            catch (InvalidTimeZoneException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Romance Standard Time");
            }
        }

        private static bool HasExplicitTimeZoneOffset(string value)
        {
            if (value.EndsWith("Z", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            var timeSeparatorIndex = value.IndexOf('T');

            if (timeSeparatorIndex < 0)
            {
                timeSeparatorIndex = value.IndexOf(' ');
            }

            if (timeSeparatorIndex < 0)
            {
                return false;
            }

            return HasOffsetSuffix(value, suffixLength: 6) || HasOffsetSuffix(value, suffixLength: 5);
        }

        private static bool HasOffsetSuffix(string value, int suffixLength)
        {
            if (value.Length < suffixLength)
            {
                return false;
            }

            var signIndex = value.Length - suffixLength;
            var sign = value[signIndex];

            if (sign is not ('+' or '-'))
            {
                return false;
            }

            if (suffixLength == 6)
            {
                return char.IsDigit(value[signIndex + 1])
                    && char.IsDigit(value[signIndex + 2])
                    && value[signIndex + 3] == ':'
                    && char.IsDigit(value[signIndex + 4])
                    && char.IsDigit(value[signIndex + 5]);
            }

            return char.IsDigit(value[signIndex + 1])
                && char.IsDigit(value[signIndex + 2])
                && char.IsDigit(value[signIndex + 3])
                && char.IsDigit(value[signIndex + 4]);
        }

        private static string? TrimUsername(string? username) => username?.ToUpper().Replace("PROD\\", "");

        private sealed record DashboardActivityMetadata(
            string Type,
            string Severity,
            string Status,
            string Title,
            string Description);
    }
}
