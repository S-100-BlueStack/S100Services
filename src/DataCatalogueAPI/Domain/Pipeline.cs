namespace DataCatalague.Api.Domain
{
    public sealed class Pipeline
    {
        public required Guid Uuid { get; set; }

        public required string Name { get; set; }
    }
}
