namespace ProductCatalogueAPI.Jobs
{
    public interface IBackgroundJob
    {
        Task RunAsync(CancellationToken token);
    }

    public interface IBackgroundJob<in TArgs>
    {
        Task RunAsync(TArgs args, CancellationToken token);
    }
}
