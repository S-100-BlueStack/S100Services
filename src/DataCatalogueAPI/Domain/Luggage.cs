using Eventuous;
using static DataCatalague.Api.Domain.LuggageEvents;

namespace DataCatalague.Api.Domain
{
    public record LuggageId(string Value) : Id(Value);

    public record LuggageState : State<LuggageState>
    {
        public Guid Uuid { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public LuggageState() {
            On<V1.LuggageCreated>(Created);
        }

        static LuggageState Created(LuggageState state, V1.LuggageCreated e)
            => state with {
                Uuid = e.Uuid,
                DisplayName = e.DisplayName,
                Description = e.Description,
                LastUpdatedUtc = e.CreatedUTC,
            };
    }

    public class Luggage : Aggregate<LuggageState>
    {
        public async Task Create(
                    Guid Uuid,
                    string DisplayName,
                    string? Description
            ) {
            EnsureDoesntExist();
            Apply(new V1.LuggageCreated(Uuid, DisplayName, Description, DateTime.UtcNow));
        }
    }

    public static class LuggageCommands
    {
        public record Create(Guid Uuid, string DisplayName, string? Description = default);
    }

    public static class LuggageEvents
    {
        public static class V1
        {
            [EventType("V1.LuggageCreated")]
            public record LuggageCreated(
                    Guid Uuid,
                    string DisplayName,
                    string? Description,
                    DateTimeOffset CreatedUTC
                );
        }
    }

    public static class LuggageExtension
    {
        public static LuggageId ToLuggageId(this Guid uuid) => new LuggageId(uuid.ToString("B"));
    }
}
