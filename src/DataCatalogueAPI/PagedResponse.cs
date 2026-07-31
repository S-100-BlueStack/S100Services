namespace OpenApiDemo.Api.Models.V2;

/// <summary>
/// A page of results together with the paging metadata needed to fetch the rest.
/// </summary>
/// <typeparam name="T">The type of the items in the page.</typeparam>
public sealed class PagedResponse<T>
{
    /// <summary>Gets the items in the current page.</summary>
    public required IReadOnlyList<T> Items { get; init; }

    /// <summary>Gets the one-based page number that was returned.</summary>
    /// <example>1</example>
    public required int Page { get; init; }

    /// <summary>Gets the maximum number of items per page.</summary>
    /// <example>20</example>
    public required int PageSize { get; init; }

    /// <summary>Gets the total number of items across all pages.</summary>
    /// <example>3</example>
    public required int TotalCount { get; init; }

    /// <summary>Gets the total number of pages available.</summary>
    /// <example>1</example>
    public int TotalPages => this.PageSize == 0 ? 0 : (int)Math.Ceiling(this.TotalCount / (double)this.PageSize);
}
