using System.Text.Json;
using static ProductCatalogueAPI.Models.ResponseTypes;

namespace TestProductCatalogueAPI;

public sealed class AoiResponseSerializationTests
{
    [Fact]
    public void NullAoiAttributesAreOmittedFromTheJsonResponse()
    {
        var json = JsonSerializer.Serialize(new AOIResponse
        {
            Geometry = "{\"rings\":[]}",
            Attributes = new Attributes
            {
                DatasetName = "101DK0000001E",
                Status = ProductStatus.Idle,
            },
        });

        Assert.Contains("\"DatasetName\":\"101DK0000001E\"", json);
        Assert.Contains("\"Status\":1", json);
        Assert.DoesNotContain("DisplayScale", json);
        Assert.DoesNotContain("UsageBand", json);
        Assert.DoesNotContain("Edition", json);
        Assert.DoesNotContain("Update", json);
        Assert.DoesNotContain("IssueDate", json);
        Assert.DoesNotContain("ErrorMessage", json);
    }
}
