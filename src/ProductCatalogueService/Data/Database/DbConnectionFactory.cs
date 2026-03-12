using Microsoft.Data.SqlClient;
using System.Data;

namespace ProductCatalogueService.Data.Database;

public class DbConnectionFactory(IConfiguration config)
{
    private readonly IConfiguration _config = config;

    public IDbConnection Create() {
        var filePath = _config.GetSection("Connections")["SystemConnection"];

        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            throw new InvalidOperationException($"System:ConnectionFile is not configured or insufficient access: {filePath}");

        var connectionString = File.ReadAllText(filePath);

        return new SqlConnection(connectionString);
    }
}