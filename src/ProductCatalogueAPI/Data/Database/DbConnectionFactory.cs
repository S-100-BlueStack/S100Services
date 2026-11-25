using System.Data;
using Microsoft.Data.SqlClient;

namespace ProductCatalogueAPI.Data.Database;

/// <summary>Builds connections to the ProductCatalogue System database using the configured connection file.</summary>
/// <param name="config">Configuration containing the Connections:SystemConnection file path.</param>
public class DbConnectionFactory(IConfiguration config)
{
    private readonly IConfiguration _config = config;

    /// <summary>Creates a closed SQL connection owned by the caller.</summary>
    /// <returns>A new connection that the caller must open and dispose.</returns>
    /// <exception cref="InvalidOperationException">The configured connection file is missing or inaccessible.</exception>
    /// <exception cref="IOException">An error occurs while reading the connection file.</exception>
    public virtual IDbConnection Create() {
        var filePath = _config.GetSection("Connections")["SystemConnection"];

        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            throw new InvalidOperationException($"System:ConnectionFile is not configured or insufficient access: {filePath}");

        var connectionString = File.ReadAllText(filePath);

        return new SqlConnection(connectionString);
    }
}
