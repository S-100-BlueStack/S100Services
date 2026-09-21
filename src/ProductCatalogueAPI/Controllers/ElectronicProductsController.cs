using Azure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using NetTopologySuite.Geometries;
using NetTopologySuite.IO;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using ProductCatalogueAPI.Models;
using ProductCatalogueAPI.OpenApi;
using ProductCatalogueAPI.Services.Dashboard;
using ProductCatalogueAPI.Services.Export;
using ProductCatalogueAPI.Services.History;
using S100FC.ProductCatalogue;
using S100FC.S128.FeatureTypes;
using S100FC.S128.SimpleAttributes;
using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using static ProductCatalogueAPI.Models.RequestTypes;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace ProductCatalogueAPI.Controllers
{
    [AllowAnonymous]
    //[Authorize("productmanager:access")]
    [ApiController]
    [Route("[controller]")]
    public class ElectronicProductsController(ILogger<ElectronicProductsController> logger, IMemoryCache cache, IProductManager productManager, IProductRepository repository, IProductWorkflowRepository workflowRepository, IProductHistoryEventService historyEventService = null!, IProductWorkspaceFreshnessRepository workspaceFreshnessRepository = null!) : ControllerBase
    {
        private const string AoiCacheKeyPrefix = "electronic-products-aoi";
        private static readonly TimeSpan AoiCacheLifetime = TimeSpan.FromHours(24);
        private const int WorkspaceFreshnessDatasetLimit = 50;

        private readonly ILogger<ElectronicProductsController> _logger = logger;
        private readonly IElectronicProductManager _electronicProductManager = productManager.ElectronicProductManager;
        private readonly IMemoryCache _cache = cache;
        private readonly IProductRepository _repository = repository;
        private readonly IProductWorkflowRepository _workflowRepository = workflowRepository;
        private readonly IProductWorkspaceFreshnessRepository? _workspaceFreshnessRepository = workspaceFreshnessRepository;

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
        /// Gets lightweight revision tokens for open Analyze and Review workspace Products.
        /// </summary>
        /// <remarks>
        /// The endpoint reads cached S-128 Product metadata and SQL-owned workflow signals only.
        /// It deliberately does not dispatch ArcGIS work, load Product History bodies, or read artifact content.
        /// </remarks>
        [ProducesResponseType(typeof(ApiResponse<ProductWorkspaceFreshnessResponse[]>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [HttpGet("workspace/freshness", Name = "GetElectronicProductWorkspaceFreshness")]
        public async Task<IActionResult> GetWorkspaceFreshness(
            [FromQuery] string[] datasetNames,
            CancellationToken cancellationToken)
        {
            var sw = Stopwatch.StartNew();
            var names = NormalizeWorkspaceDatasetNames(datasetNames);

            if (names.Length == 0)
            {
                return BadRequest(new ApiResponse
                {
                    Success = false,
                    Message = "At least one datasetNames query parameter is required.",
                    DurationMs = sw.ElapsedMilliseconds
                });
            }

            if (names.Length > WorkspaceFreshnessDatasetLimit)
            {
                return BadRequest(new ApiResponse
                {
                    Success = false,
                    Message = $"At most {WorkspaceFreshnessDatasetLimit} datasetNames query parameters are supported.",
                    DurationMs = sw.ElapsedMilliseconds
                });
            }

            if (_workspaceFreshnessRepository is null)
                throw new InvalidOperationException("Product workspace freshness persistence is not configured.");

            var resolvedProducts = names
                .Select(name => new WorkspaceFreshnessProduct(name, _electronicProductManager.ElectronicProduct(name)))
                .ToArray();

            var relatedNames = resolvedProducts
                .Where(item => item.Product is not null)
                .SelectMany(item => GetRelatedDatasetNames(item.Product!))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            var persistedSnapshot = await _workspaceFreshnessRepository.GetSnapshotAsync(
                relatedNames,
                cancellationToken);

            var responseItems = resolvedProducts.Select(item =>
            {
                if (item.Product is null || string.IsNullOrWhiteSpace(item.Product.datasetName))
                    return new ProductWorkspaceFreshnessResponse(item.RequestedDatasetName, null, Available: false);

                var canonicalDatasetName = item.Product.datasetName.Trim();
                var relatedDatasetNames = GetRelatedDatasetNames(item.Product);
                var revision = CreateWorkspaceFreshnessRevision(
                    item.Product,
                    canonicalDatasetName,
                    relatedDatasetNames,
                    persistedSnapshot);

                return new ProductWorkspaceFreshnessResponse(canonicalDatasetName, revision, Available: true);
            }).ToArray();

            return Ok(new ApiResponse<ProductWorkspaceFreshnessResponse[]>
            {
                Data = responseItems,
                TotalHits = responseItems.Length,
                DurationMs = sw.ElapsedMilliseconds
            });
        }

        /// <summary>
        /// Get all product AOIs in the database as ESRI json feature collection.
        /// </summary>
        /// <returns>An ESRI json feature collection for all product AOIs.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("aoi")]
        public async Task<IActionResult> GetAllElectronicProductsAOI([FromQuery, SwaggerAllowedValues(nameof(ProductSpecification.S57), nameof(ProductSpecification.S101))] string productSpecification = "S101")
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
            var cacheState = "None";
            var succeeded = false;

            try
            {
                if (!TryParseAoiProductSpecification(productSpecification, out var selectedProductSpecification))
                    return BadRequest(new ApiResponse { Success = false, Message = "productSpecification must be S57 or S101." });

                var cacheKey = $"{AoiCacheKeyPrefix}:{selectedProductSpecification}";
                cacheState = _cache.TryGetValue(cacheKey, out Lazy<Task<Dictionary<string, string>>>? cachedAois)
                    ? "Hit"
                    : "Miss";

                cachedAois ??= _cache.GetOrCreate(cacheKey, entry => {
                    entry.AbsoluteExpirationRelativeToNow = AoiCacheLifetime;
                    return new Lazy<Task<Dictionary<string, string>>>(
                        () => _electronicProductManager.GetDatasetAOIs(selectedProductSpecification.ToString()),
                        LazyThreadSafetyMode.ExecutionAndPublication);
                }) ?? throw new InvalidOperationException("Could not create the AOI cache entry.");

                Dictionary<string, string> aois;

                geometryRetrievalStopwatch.Start();
                try
                {
                    aois = await cachedAois.Value;
                }
                catch
                {
                    // Do not retain a failed ArcGIS lookup task; the next request should be able to retry.
                    _cache.Remove(cacheKey);
                    throw;
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
                    var electronicProduct = _electronicProductManager.ElectronicProduct(aoi.Key, selectedProductSpecification.ToString());

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

                    if (!MatchesProductSpecification(electronicProduct, selectedProductSpecification))
                        continue;

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
                        currentProducts = await _repository.GetCurrentByNamesAsync(mappedProducts.Select(product => product.DatasetName), selectedProductSpecification);
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
                            // Products without a SQL workflow track remain idle until internal work begins.
                            DisplayScale = mappedProduct.Product.optimumDisplayScale,
                            UsageBand = mappedProduct.Product.specificUsage,
                            ErrorMessage = current?.ErrorMessage
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
                    cacheState
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

            var current = await _repository.GetCurrentByNameAsync(electronicProduct.datasetName!);
            // var s57current = await _repository.GetCurrentByNameAsync(s57product.datasetName);
            var s128Status = Enum.Parse<ProductStatus>((current?.State ?? ProductState.Idle).ToString());
            // var s57Status = Enum.Parse((s57current?.State ?? Data.Models.ProductState.Idle).ToString());

            var tracks = await GetRelatedExportTracksAsync(electronicProduct);
            var exports = new List<ProductExport>();
            foreach (var track in tracks)
            {
                // A track is retained after CancelExport so its state history remains auditable.
                // It is not a current export unless it still has a candidate or a published version.
                var hasActiveCandidate = track.CandidateEdition.HasValue && track.CandidateUpdate.HasValue;
                var latestRevisionId = hasActiveCandidate
                    ? await _workflowRepository.GetLatestRevisionIdAsync(track.Id)
                    : null;
                var artifacts = latestRevisionId is Guid revisionId
                    ? await _workflowRepository.GetValidationArtifactsAsync(revisionId)
                    : [];
                var artifactLinks = artifacts.Select(artifact => new ProductArtifactLinkResponse(
                    artifact.Id,
                    artifact.FileName,
                    artifact.MediaType,
                    artifact.CreatedAtUtc,
                    Url.Action(nameof(DownloadValidationArtifact), new { name = track.DatasetName, artifactId = artifact.Id }) ?? $"/electronicproducts/{Uri.EscapeDataString(track.DatasetName)}/artifacts/{artifact.Id:D}"))
                    .ToArray();

                exports.Add(new ProductExport(
                    track.ProductSpecification == ProductSpecification.S101 ? "S100" : "S57",
                    track.DatasetName,
                    track.CandidateEdition ?? track.PublishedEdition,
                    track.CandidateUpdate ?? track.PublishedUpdate,
                    Enum.Parse<ProductStatus>(track.State.ToString()),
                    track.UpdatedAtUtc,
                    track.ErrorMessage,
                    artifactLinks));
            }

            var product = new ProductResponse
            {
                IssueDate = electronicProduct.issueDate,
                Name = electronicProduct.datasetName,
                Edition = electronicProduct.editionNumber,
                Update = electronicProduct.updateNumber,
                UsageBand = electronicProduct.specificUsage,
                Status = s128Status,
                ErrorMessage = current?.ErrorMessage,
                Exports = exports
            };

            response.Data = product;
            response.TotalHits = 1;
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
        }

        /// <summary>Downloads a validator diagnostic associated with the requested dataset.</summary>
        [ProducesResponseType(typeof(FileContentResult), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [HttpGet("{name}/artifacts/{artifactId:guid}", Name = "DownloadValidationArtifact")]
        public async Task<IActionResult> DownloadValidationArtifact(string name, Guid artifactId, CancellationToken cancellationToken)
        {
            var artifact = await _workflowRepository.GetValidationArtifactAsync(name, artifactId, cancellationToken);
            return artifact is null ? NotFound() : File(artifact.Content, artifact.MediaType, artifact.FileName);
        }

        /// <summary>Gets every validation artifact created for the product's S-57 and S-101 export tracks.</summary>
        /// <param name="name">The name of the dataset.</param>
        /// <param name="cancellationToken">The request cancellation token.</param>
        /// <returns>All validation artifacts, including artifacts from previous candidate revisions.</returns>
        [ProducesResponseType(typeof(ApiResponse<ProductArtifactHistoryResponse[]>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [HttpGet("{name}/artifacts/history", Name = "GetValidationArtifactHistory")]
        public async Task<IActionResult> GetValidationArtifactHistory(string name, CancellationToken cancellationToken)
        {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<ProductArtifactHistoryResponse[]>();
            var electronicProduct = _electronicProductManager.ElectronicProduct(name);

            if (electronicProduct is null)
            {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var tracks = await GetRelatedExportTracksAsync(electronicProduct, cancellationToken);
            var artifacts = new List<ProductArtifactHistoryResponse>();
            foreach (var track in tracks)
            {
                var trackArtifacts = await _workflowRepository.GetValidationArtifactHistoryAsync(track.Id, cancellationToken);
                artifacts.AddRange(trackArtifacts.Select(artifact => new ProductArtifactHistoryResponse(
                    artifact.Id,
                    artifact.TrackId,
                    artifact.RevisionId,
                    track.DatasetName,
                    track.ProductSpecification.ToString(),
                    artifact.Kind.ToString(),
                    artifact.FileName,
                    artifact.MediaType,
                    artifact.CreatedAtUtc,
                    Url.Action(nameof(DownloadValidationArtifact), new { name = track.DatasetName, artifactId = artifact.Id })
                        ?? $"/electronicproducts/{Uri.EscapeDataString(track.DatasetName)}/artifacts/{artifact.Id:D}")));
            }

            response.Data = [.. artifacts.OrderByDescending(artifact => artifact.CreatedAtUtc)];
            response.TotalHits = artifacts.Count;
            response.DurationMs = sw.ElapsedMilliseconds;
            return Ok(response);
        }

        /// <summary>
        /// Get a specific electronic product's AOI.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product's AOI and authoritative product specification.</returns>
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status404NotFound, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status409Conflict, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}/aoi", Name = "GetElectronicProductAoi")]
        public async Task<IActionResult> GetElectronicProductAoi(string name)
        {
            var sw = Stopwatch.StartNew();
            var response = new ApiResponse<AOIResponse>();

            ExportProductIdentity? identity;
            try
            {
                identity = ExportProductResolver.Resolve(_electronicProductManager, name);
            }
            catch (ProductMappingIntegrityException ex)
            {
                _logger.LogError(ex, "Electronic Product AOI identity resolution failed. DatasetName: {DatasetName}.", name);
                response.Success = false;
                response.Message = "The electronic product identity is ambiguous or invalid.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return Conflict(response);
            }

            if (identity is null)
            {
                response.Success = false;
                response.Message = $"No electronic product with name '{name}' was found.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var electronicProduct = _electronicProductManager.ElectronicProduct(
                identity.DatasetName,
                identity.ProductSpecification.ToString());
            if (electronicProduct is null)
            {
                _logger.LogError(
                    "Electronic Product AOI identity could not be re-resolved by specification. DatasetName: {DatasetName}. ProductSpecification: {ProductSpecification}.",
                    identity.DatasetName,
                    identity.ProductSpecification);
                response.Success = false;
                response.Message = "The electronic product identity could not be resolved consistently.";
                response.DurationMs = sw.ElapsedMilliseconds;
                return Conflict(response);
            }

            var boundary = await _electronicProductManager.GetDatasetBoundary(identity.DatasetName);

            if (boundary.IsNullOrEmpty())
            {
                response.Success = false;
                response.Message = $"No AOI could be found for electronic product with name '{identity.DatasetName}'";
                response.DurationMs = sw.ElapsedMilliseconds;
                return NotFound(response);
            }

            var current = (await _repository.GetCurrentByNamesAsync(
                [identity.DatasetName],
                identity.ProductSpecification)).SingleOrDefault();

            var aoiResponse = new AOIResponse
            {
                Geometry = boundary,
                Attributes = new Attributes
                {
                    DatasetName = identity.DatasetName,
                    ProductSpecification = identity.ProductSpecification.ToString(),
                    Status = Enum.Parse<ProductStatus>((current?.State ?? ProductState.Idle).ToString()),
                    // Products without a SQL workflow track remain idle until internal work begins.
                    DisplayScale = electronicProduct.optimumDisplayScale,
                    UsageBand = electronicProduct.specificUsage,
                    Edition = electronicProduct.editionNumber,
                    Update = electronicProduct.updateNumber,
                    IssueDate = electronicProduct.issueDate,
                    ErrorMessage = current?.ErrorMessage,
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

            // Todo: change argument to AOI and do arcgis core geometry conversion in ProductManagerCore
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
        /// <returns>Dashboard summary and activity rows derived from normalized product-track history.</returns>
        [ProducesResponseType(typeof(ApiResponse<DashboardResponse>), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status400BadRequest, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("dashboard", Name = "GetElectronicProductsDashboard")]
        public async Task<IActionResult> GetElectronicProductsDashboard(
            [FromQuery] string? from,
            [FromQuery] string? to = null,
            [FromQuery] string? search = null,
            [FromQuery] string? product = null,
            [FromQuery] string? type = null,
            [FromQuery] string? status = null,
            [FromQuery] string? importance = null,
            [FromQuery] string? reports = null,
            [FromQuery] int? pageSize = null,
            [FromQuery] string? cursor = null,
            [FromQuery] string? sortBy = null,
            [FromQuery] string? sortDirection = null)
        {
            var totalStopwatch = Stopwatch.StartNew();

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
                    DurationMs = totalStopwatch.ElapsedMilliseconds
                });
            }

            if (!DashboardQueryOptions.TryCreate(
                search,
                product,
                type,
                status,
                importance,
                reports,
                pageSize,
                cursor,
                out var queryOptions,
                out validationMessage,
                sortBy ?? (HttpContext?.Request.Query.ContainsKey("sortBy") == true ? "" : null),
                sortDirection ?? (HttpContext?.Request.Query.ContainsKey("sortDirection") == true ? "" : null)))
            {
                return BadRequest(new ApiResponse
                {
                    Success = false,
                    Message = validationMessage,
                    DurationMs = totalStopwatch.ElapsedMilliseconds
                });
            }

            var repositoryStopwatch = Stopwatch.StartNew();
            var rows = (await _repository.GetHistoryAsync(fromDatabaseTime, toDatabaseTime)).ToArray();
            repositoryStopwatch.Stop();

            var mappingStopwatch = Stopwatch.StartNew();
            var sourceActivities = rows.Select(ToDashboardActivity).ToArray();
            mappingStopwatch.Stop();

            var filteringStopwatch = Stopwatch.StartNew();
            var queryResult = DashboardQueryProcessor.Execute(sourceActivities, queryOptions);
            filteringStopwatch.Stop();

            var responseData = DashboardQueryProcessor.CreateResponse(
                fromDanishTime,
                toDanishTime,
                GetDashboardNow(),
                queryResult,
                DashboardTimeZoneId);

            var response = new ApiResponse<DashboardResponse>
            {
                Data = responseData,
                TotalHits = queryResult.FilteredActivities.Count,
                DurationMs = totalStopwatch.ElapsedMilliseconds
            };

            _logger.LogInformation(
                "Dashboard query completed. SourceRows: {SourceRows}. FilteredRows: {FilteredRows}. ReturnedRows: {ReturnedRows}. RepositoryMs: {RepositoryMs}. MappingMs: {MappingMs}. FilteringAndPagingMs: {FilteringAndPagingMs}. TotalMs: {TotalMs}.",
                rows.Length,
                queryResult.FilteredActivities.Count,
                queryResult.PageActivities.Count,
                repositoryStopwatch.Elapsed.TotalMilliseconds,
                mappingStopwatch.Elapsed.TotalMilliseconds,
                filteringStopwatch.Elapsed.TotalMilliseconds,
                totalStopwatch.Elapsed.TotalMilliseconds);

            return Ok(response);
        }

        /// <summary>
        /// Get the history of a specific electronic product.
        /// </summary>
        /// <param name="name">The name of the dataset.</param>
        /// <returns>The product.</returns>
        [ProducesResponseType(typeof(ProductHistoryEnvelope), StatusCodes.Status200OK, "application/json")]
        [ProducesResponseType(typeof(ApiResponse), StatusCodes.Status500InternalServerError, "application/json")]
        [HttpGet("{name}/history", Name = "GetElectronicProductHistory")]
        public async Task<IActionResult> GetElectronicProductHistory(string name)
        {
            var sw = Stopwatch.StartNew();
            var response = new ProductHistoryEnvelope();
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
                    Id = r.Id,
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
            string? canonicalDatasetName;
            try { canonicalDatasetName = ProductHistoryEventContract.NormalizeDatasetName(name); }
            catch (ArgumentException)
            {
                // Audit storage limits must not reject a Product already resolved by the state-history flow.
                // Such a name cannot have audit events written through the audit contract.
                canonicalDatasetName = null;
            }
            if (canonicalDatasetName != null)
            {
                if (historyEventService is null)
                    throw new InvalidOperationException("Product History audit service is not configured.");
                var events = await historyEventService.GetFinalizedByDatasetNameAsync(canonicalDatasetName);
                response.Events = events.Where(e => e.FinalizedAtUtc.HasValue)
                    .Select(ProductHistoryEventResponse.FromRecord).ToArray();
                response.EventTotalHits = response.Events.Length;
            }
            response.DurationMs = sw.ElapsedMilliseconds;

            return this.Ok(response);
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
                Description = string.IsNullOrWhiteSpace(record.ErrorMessage) ? metadata.Description : record.ErrorMessage,
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

            if (!string.IsNullOrWhiteSpace(record.ErrorCode))
                details.Add(new DashboardActivityDetailResponse { Label = "Error code", Value = record.ErrorCode });

            if (!string.IsNullOrWhiteSpace(record.ErrorMessage))
                details.Add(new DashboardActivityDetailResponse { Label = "Error message", Value = record.ErrorMessage });

            return details;
        }

        private static bool TryParseAoiProductSpecification(string value, out ProductSpecification productSpecification)
        {
            var normalized = value.Trim().Replace("-", string.Empty, StringComparison.Ordinal).ToUpperInvariant();
            return Enum.TryParse(normalized, out productSpecification) && productSpecification is ProductSpecification.S57 or ProductSpecification.S101;
        }

        private async Task<IReadOnlyList<ProductExportTrackRecord>> GetRelatedExportTracksAsync(ElectronicProduct electronicProduct, CancellationToken cancellationToken = default)
        {
            var tracks = new List<ProductExportTrackRecord>();
            foreach (var relatedDatasetName in GetRelatedDatasetNames(electronicProduct))
                tracks.AddRange(await _workflowRepository.GetTracksAsync(relatedDatasetName, cancellationToken));

            return [.. tracks
                .DistinctBy(track => track.Id)
                .Where(track => track.ProductSpecification is ProductSpecification.S57 or ProductSpecification.S101)
                .Where(track => (track.CandidateEdition.HasValue && track.CandidateUpdate.HasValue)
                    || track.PublishedEdition > 0
                    || track.PublishedUpdate > 0)
                .OrderBy(track => track.ProductSpecification)];
        }

        private IReadOnlyList<string> GetRelatedDatasetNames(ElectronicProduct electronicProduct)
        {
            if (string.IsNullOrWhiteSpace(electronicProduct.datasetName))
                return [];

            var datasetName = electronicProduct.datasetName.Trim();
            var relatedDatasetNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { datasetName };
            foreach (var specification in new[] { ProductSpecification.S57, ProductSpecification.S101 })
            {
                foreach (var mappedProduct in _electronicProductManager.GetMappedElectronicProducts(datasetName, specification.ToString()))
                {
                    if (!string.IsNullOrWhiteSpace(mappedProduct.datasetName))
                        relatedDatasetNames.Add(mappedProduct.datasetName.Trim());
                }
            }

            return [.. relatedDatasetNames.OrderBy(name => name, StringComparer.OrdinalIgnoreCase)];
        }

        private static string[] NormalizeWorkspaceDatasetNames(IEnumerable<string>? datasetNames) =>
            (datasetNames ?? Array.Empty<string>())
                .Select(name => name?.Trim() ?? string.Empty)
                .Where(name => name.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

        private static string CreateWorkspaceFreshnessRevision(
            ElectronicProduct electronicProduct,
            string canonicalDatasetName,
            IReadOnlyCollection<string> relatedDatasetNames,
            ProductWorkspaceFreshnessStoreSnapshot persistedSnapshot)
        {
            var relatedNameSet = relatedDatasetNames.ToHashSet(StringComparer.OrdinalIgnoreCase);
            var tracks = persistedSnapshot.Tracks
                .Where(track => relatedNameSet.Contains(track.DatasetName))
                .OrderBy(track => track.DatasetName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(track => track.ProductSpecification, StringComparer.Ordinal)
                .ThenBy(track => track.TrackId)
                .Select(track => new
                {
                    track.TrackId,
                    track.DatasetName,
                    track.ProductSpecification,
                    track.State,
                    track.PublishedEdition,
                    track.PublishedUpdate,
                    track.CandidateEdition,
                    track.CandidateUpdate,
                    track.UpdatedAtUtc,
                    RowVersion = Convert.ToHexString(track.RowVersion),
                    track.StateHistoryCount,
                    track.LatestStateHistoryId,
                    track.LatestStateHistoryAtUtc,
                    track.ValidationArtifactCount,
                    track.LatestValidationArtifactId,
                    track.LatestValidationArtifactAtUtc
                })
                .ToArray();

            var canonicalAuditDatasetName = canonicalDatasetName.ToUpperInvariant();
            var audit = persistedSnapshot.AuditEvents.FirstOrDefault(item =>
                string.Equals(item.DatasetName, canonicalAuditDatasetName, StringComparison.Ordinal));

            var payload = JsonSerializer.Serialize(new
            {
                Version = 1,
                Product = new
                {
                    DatasetName = canonicalDatasetName,
                    ProductSpecification = electronicProduct.productSpecification?.name,
                    electronicProduct.editionNumber,
                    electronicProduct.updateNumber,
                    electronicProduct.issueDate,
                    electronicProduct.specificUsage,
                    electronicProduct.optimumDisplayScale
                },
                RelatedDatasetNames = relatedDatasetNames.OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray(),
                Tracks = tracks,
                Audit = audit is null
                    ? null
                    : new
                    {
                        audit.DatasetName,
                        audit.EventCount,
                        audit.LatestUpdatedAtUtc
                    }
            });

            var digest = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
            return $"v1:{Convert.ToHexString(digest).ToLowerInvariant()}";
        }

        private sealed record WorkspaceFreshnessProduct(string RequestedDatasetName, ElectronicProduct? Product);

        private static bool MatchesProductSpecification(ElectronicProduct product, ProductSpecification productSpecification)
        {
            var value = product.productSpecification?.name;
            return value is not null && TryParseAoiProductSpecification(value, out var parsed) && parsed == productSpecification;
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

                ProductState.ChangesDetected => new DashboardActivityMetadata(
                    Type: "change",
                    Severity: "normal",
                    Status: "active",
                    Title: "Changes detected",
                    Description: "Source changes are accumulating in the daily YAML summary."),

                ProductState.Exporting => new DashboardActivityMetadata(
                    Type: "export",
                    Severity: "normal",
                    Status: "active",
                    Title: "Export running",
                    Description: "An unverified candidate export is being generated."),

                ProductState.Validating => new DashboardActivityMetadata(
                    Type: "validation",
                    Severity: "normal",
                    Status: "active",
                    Title: "Validation running",
                    Description: "The generated candidate is being validated."),

                ProductState.ReadyForDistribution => new DashboardActivityMetadata(
                    Type: "export",
                    Severity: "normal",
                    Status: "completed",
                    Title: "Ready for distribution",
                    Description: "The candidate is validated but has not been accepted or published to S-128."),

                ProductState.AcceptedForDistribution => new DashboardActivityMetadata(
                    Type: "send",
                    Severity: "normal",
                    Status: "completed",
                    Title: "Accepted for distribution",
                    Description: "IC-ENC acceptance is recorded; S-128 publication can be performed by a future workflow."),

                ProductState.Published => new DashboardActivityMetadata(
                    Type: "publication",
                    Severity: "normal",
                    Status: "completed",
                    Title: "Published",
                    Description: "The accepted version is recorded as publicly available."),

                ProductState.Cancelled => new DashboardActivityMetadata(
                    Type: "cancel",
                    Severity: "normal",
                    Status: "completed",
                    Title: "Export cancelled",
                    Description: "The unverified candidate export was cancelled."),

                ProductState.Error => new DashboardActivityMetadata(
                    Type: "error",
                    Severity: "critical",
                    Status: "failed",
                    Title: "Export error",
                    Description: "Export or validation failed and requires review."),

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

            // ProductStateHistory stores UTC instants; Copenhagen conversion is an API-boundary concern.
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
