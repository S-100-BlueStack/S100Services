using ProductCatalogueService.Data.Models;
using ProductCatalogueService.Data.Repositories;

namespace ProductCatalogueService.Jobs
{
    public class ProcessProductStatusEmailsJob(IProductRepository repository, ILogger<ProcessProductStatusEmailsJob> logger) : IBackgroundJob
    {
        private readonly IProductRepository _repository = repository;
        private readonly ILogger<ProcessProductStatusEmailsJob> _logger = logger;
        public async Task RunAsync(CancellationToken token) {
            _logger.LogInformation("Job: {jobName} started", nameof(ProcessProductStatusEmailsJob));

            throw new NotImplementedException();


            // TODO

            // Step 1) Connect to the email. Microsoft.Graph OR Microsoft.Exchange.WebServices.Data.. Skip this step for now and just read from sample emails


            // Step 2) Read content and scan for results. RegEx for keywords in subject/body? 


            // Step 3) Post to database with identified status (Failed/Invalid, Success, Awaiting)

            // Appends row to SCD Type2 database 'upsert'
            await _repository.AppendAsync("101DK0040349E", ProductState.InTransit);

   
            // Step 4) Save P007 report file somewhere somehow. as byte[] in database perhaps



            _logger.LogInformation("Job: {jobName} finished", nameof(ProcessProductStatusEmailsJob));
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