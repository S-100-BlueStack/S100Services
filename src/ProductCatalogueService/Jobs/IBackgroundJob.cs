namespace ProductCatalogueService.Jobs
{
    public interface IBackgroundJob
    {
        Task RunAsync(CancellationToken token);
    }

    public interface IBackgroundJob<TArg>
    {
        Task RunAsync(TArg arg, CancellationToken token);
    }
}
