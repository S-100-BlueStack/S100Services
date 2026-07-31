using System.ComponentModel.DataAnnotations;
using Asp.Versioning;
using Microsoft.AspNetCore.Mvc;
using OpenApiDemo.Api.Configuration;
using OpenApiDemo.Api.Models.V2;
using OpenApiDemo.Api.Services;

namespace OpenApiDemo.Api.Controllers.V2;

/// <summary>
/// Access to the product catalogue, with paging and full product details.
/// </summary>
/// <param name="repository">The product catalogue.</param>
/// <param name="logger">The logger for this controller.</param>
[ApiController]
[ApiVersion(ApiVersions.V2Text)]
[Route("api/v{version:apiVersion}/products")]
[Produces("application/json")]
public sealed class ProductsController(
    IProductRepository repository,
    ILogger<ProductsController> logger) : ControllerBase
{
    private const int DefaultPageSize = 20;

    private readonly IProductRepository repository = repository;
    private readonly ILogger<ProductsController> logger = logger;

    /// <summary>
    /// Returns a page of products.
    /// </summary>
    /// <param name="page">The one-based page number to return.</param>
    /// <param name="pageSize">The maximum number of products per page.</param>
    /// <param name="cancellationToken">A token used to cancel the request.</param>
    /// <returns>The requested page of products together with paging metadata.</returns>
    /// <response code="200">The page was returned successfully.</response>
    /// <response code="400">The paging parameters were outside the allowed range.</response>
    [HttpGet]
    [ProducesResponseType<PagedResponse<ProductResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PagedResponse<ProductResponse>>> GetPage(
        [FromQuery][Range(1, int.MaxValue)] int page = 1,
        [FromQuery][Range(1, 100)] int pageSize = DefaultPageSize,
        CancellationToken cancellationToken = default)
    {
        this.logger.LogInformation(
            "Listing products page {Page} with page size {PageSize}.", page, pageSize);

        var (items, totalCount) = await this.repository
            .GetPageAsync((page - 1) * pageSize, pageSize, cancellationToken)
            .ConfigureAwait(false);

        return this.Ok(new PagedResponse<ProductResponse>
        {
            Items = items.Select(Map).ToList(),
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
        });
    }

    /// <summary>
    /// Returns a single product by its identifier.
    /// </summary>
    /// <param name="id">The identifier of the product to return.</param>
    /// <param name="cancellationToken">A token used to cancel the request.</param>
    /// <returns>The requested product.</returns>
    /// <response code="200">The product was found.</response>
    /// <response code="404">No product exists with the supplied identifier.</response>
    [HttpGet("{id:int}", Name = "GetProductV2")]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ProductResponse>> GetById(
        int id,
        CancellationToken cancellationToken)
    {
        var product = await this.repository.GetByIdAsync(id, cancellationToken).ConfigureAwait(false);

        if (product is null)
        {
            this.logger.LogInformation("Product {ProductId} was not found.", id);

            return this.Problem(
                title: "Product not found.",
                detail: $"No product exists with identifier {id}.",
                statusCode: StatusCodes.Status404NotFound);
        }

        return this.Ok(Map(product));
    }

    /// <summary>
    /// Adds a new product to the catalogue.
    /// </summary>
    /// <param name="request">The product to create.</param>
    /// <param name="cancellationToken">A token used to cancel the request.</param>
    /// <returns>The created product.</returns>
    /// <response code="201">The product was created.</response>
    /// <response code="400">The request payload failed validation.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType<ProductResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ProductResponse>> Create(
        [FromBody] CreateProductRequest request,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var created = await this.repository
            .AddAsync(
                new Domain.Product
                {
                    Id = 0,
                    Name = request.Name,
                    Price = request.Price,
                    Currency = request.Currency,
                    Category = request.Category,
                    LastUpdatedUtc = DateTimeOffset.UtcNow,
                },
                cancellationToken)
            .ConfigureAwait(false);

        this.logger.LogInformation("Created product {ProductId}.", created.Id);

        return this.CreatedAtRoute(
            "GetProductV2",
            new { id = created.Id, version = ApiVersions.V2Text },
            Map(created));
    }

    private static ProductResponse Map(Domain.Product product) => new()
    {
        Id = product.Id,
        Name = product.Name,
        Price = product.Price,
        Currency = product.Currency,
        Category = product.Category,
        LastUpdatedUtc = product.LastUpdatedUtc,
    };
}
