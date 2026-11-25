using ProductCatalogueAPI.Data.Models;

namespace ProductCatalogueAPI.Jobs;

/// <summary>Immutable candidate identity captured before enqueueing a package send.</summary>
/// <param name="DatasetName">Canonical member dataset.</param>
/// <param name="Specification">Member's S-57 or S-101 format.</param>
/// <param name="Edition">Expected candidate edition.</param>
/// <param name="Update">Expected candidate update.</param>
/// <param name="RevisionId">Exact immutable revision; repeated edition/update values are insufficient.</param>
public sealed record EncPackageSendMember(string DatasetName, ProductSpecification Specification, int Edition, int Update, Guid RevisionId);
