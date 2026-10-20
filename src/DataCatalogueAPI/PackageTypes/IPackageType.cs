using DataCatalague.Api.Models.V1;

namespace DataCatalague.Api.PackageTypes;

/// <summary>Maps one category's source format to the common package creation request.</summary>
public interface IPackageType
{
    /// <summary>The existing category identifier handled by this implementation.</summary>
    string CategoryType { get; }

    /// <summary>Reads a local source file and prepares metadata and full geometry for package creation.</summary>
    /// <param name="sourceFile">The source file's absolute local path.</param>
    /// <param name="cancellationToken">Cancels source reading and geometry preparation.</param>
    /// <returns>A request consumed by the existing creation flow and command service.</returns>
    Task<CreatePackageRequest> CreateRequestAsync(string sourceFile, CancellationToken cancellationToken);
}

/// <summary>Selects a registered source reader without restricting dynamically created categories to an enum.</summary>
public sealed class PackageTypeFactory(IEnumerable<IPackageType> packageTypes)
{
    private readonly IReadOnlyDictionary<string, IPackageType> _types = packageTypes.ToDictionary(type => type.CategoryType, StringComparer.Ordinal);

    /// <summary>Prepares a package using the reader registered for its category identifier.</summary>
    /// <param name="categoryType">The category identifier, such as GeneralSubmission or NoticeToMariners.</param>
    /// <param name="sourceFile">The source file's absolute local path.</param>
    /// <param name="cancellationToken">Cancels source reading and geometry preparation.</param>
    /// <returns>A request ready for the common package creation flow.</returns>
    /// <exception cref="InvalidDataException">No source reader is registered for this category.</exception>
    public Task<CreatePackageRequest> CreateRequestAsync(string categoryType, string sourceFile, CancellationToken cancellationToken) {
        if (!_types.TryGetValue(categoryType, out var packageType)) {
            throw new InvalidDataException($"No source reader is registered for category '{categoryType}'. Supply explicit geometry or register an IPackageType implementation.");
        }
        cancellationToken.ThrowIfCancellationRequested();
        if (!File.Exists(sourceFile)) { throw new InvalidDataException("The package source file does not exist."); }
        return packageType.CreateRequestAsync(Path.GetFullPath(sourceFile), cancellationToken);
    }
}
