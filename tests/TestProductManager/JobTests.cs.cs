using Microsoft.Extensions.Configuration;
using ProductCatalogueAPI.Data.Database;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Data.Repositories;
using Xunit.Abstractions;

namespace TestProductCatalogueAPI
{
    public class JobTests
    {
       // private readonly ProductRepository _repository;
        private readonly ITestOutputHelper _output;
        public JobTests(ITestOutputHelper output) {
            //var connectionFile = Environment.GetEnvironmentVariable("productcatalogue_systemdb_dev");
            //var config = new ConfigurationBuilder()
            //    .AddInMemoryCollection(new Dictionary<string, string?>
            //    {
            //        { "Connections:SystemConnection", connectionFile }
            //    })
            //    .Build();

            //var factory = new DbConnectionFactory(config);
            //_repository = new ProductRepository(factory);

            _output = output;
        }

        [Fact]
        public async Task Test_AnalyzeEmails() {
            // TODO

            // Step 1) Connect to the email. Microsoft.Graph OR Microsoft.Exchange.WebServices.Data.. Skip this step for now and just read from sample emails


            // Step 2) Read content and scan for results. RegEx for keywords in subject/body? 


            // Step 3) Post to database with identified status (Failed/Invalid, Success, Awaiting)

            // Appends row to SCD Type2 database 'upsert'
           // await _repository.AppendAsync("101DK0040349E", ProductState.InTransit);


            // Step 4) Save P007 report file somewhere somehow. as byte[] in database perhaps

            System.Diagnostics.Debugger.Break();
        }
    }
}


//var service = new ExchangeService {
//    Credentials = CredentialCache.DefaultNetworkCredentials,
//    Url = new Uri("")
//};

//var results = service.FindItems(WellKnownFolderName.Inbox, new ItemView(20));

//foreach (var email in results) {
//    email.Load();

//    var subject = email.Subject;
//    var body = email.Body.Text;

//    if (subject.Contains("rejected") || body.Contains("rejected")) {
//        Console.WriteLine($"Found keyword in: {subject}");
//    }
//}