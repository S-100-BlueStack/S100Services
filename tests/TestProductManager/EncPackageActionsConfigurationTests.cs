using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using ProductCatalogueAPI.Jobs;

namespace TestProductCatalogueAPI;

/// <summary>Checks the shared API/Worker feature gate independently of hosting environment and package state.</summary>
public sealed class EncPackageActionsConfigurationTests
{
    /// <summary>An explicit flag enables every environment; missing or false remains disabled.</summary>
    [Theory]
    [InlineData("Development", true, true)]
    [InlineData("Staging", true, true)]
    [InlineData("Production", true, true)]
    [InlineData("Development", false, false)]
    [InlineData("Staging", false, false)]
    [InlineData("Production", false, false)]
    [InlineData("Development", null, false)]
    [InlineData("Production", null, false)]
    public void ExplicitConfigurationControlsPackageActions(string environmentName, bool? configured, bool expected) {
        var settings = new Dictionary<string, string?>();
        if (configured.HasValue) settings["EncPackageActions:Enabled"] = configured.Value.ToString();
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        Assert.Equal(expected, DiscardEncPackageJob.EncPackageActionsEnabled(configuration, new TestEnvironment(environmentName)));
    }

    /// <summary>Provides only host metadata; no files, database or application host are opened.</summary>
    private sealed class TestEnvironment(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "PackageActionsTests";
        public string ContentRootPath { get; set; } = string.Empty;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
