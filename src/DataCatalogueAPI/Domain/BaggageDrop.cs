using Eventuous;
using static DataCatalague.Api.Domain.Events.BaggageDropEvents;

namespace DataCatalague.Api.Domain
{
    public class BaggageDrop : Aggregate<BaggageDropState>
    {
        public async Task Create(
                    Guid Uuid,
                    string DisplayName,
                    string? Description
            ) {
            EnsureDoesntExist();
            Apply(new V1.CheckInCounterCreated(Uuid, DisplayName, Description, DateTime.UtcNow));
        }
    }

    public class Luggage : Aggregate<LuggageState>
    {
        public async Task Upload(Guid Uuid, string FileName, long FileLength) {
            EnsureDoesntExist();
            Apply(new V1.LuggageDroppedOff(Uuid, FileName, FileLength, DateTime.UtcNow));
        }
    }


    public record BaggageDropId(string Value) : Id(Value);

    public record BaggageDropState : State<BaggageDropState>
    {
        public Guid Uuid { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public BaggageDropState() {
            On<V1.CheckInCounterCreated>(Created);
        }

        static BaggageDropState Created(BaggageDropState state, V1.CheckInCounterCreated e)
            => state with {
                Uuid = e.Uuid,
                DisplayName = e.DisplayName,
                Description = e.Description,
                LastUpdatedUtc = e.CreatedUTC,
            };
    }

    public record LuggageId(string Value) : Id(Value);

    public record LuggageState : State<LuggageState>
    {
        public Guid CheckInCounter { get; set; }

        public string FileName { get; set; } = string.Empty;

        public long FileLength { get; set; }

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public LuggageState() {
            On<V1.LuggageDroppedOff>(DroppedOff);
        }

        static LuggageState DroppedOff(LuggageState state, V1.LuggageDroppedOff e)
            => state with {
                CheckInCounter = e.Uuid,
                FileName = e.FileName,
                FileLength = e.FileLength,
                LastUpdatedUtc = e.CreatedUTC,
            };
    }

    public static class LuggageExtension
    {
        public static BaggageDropId ToBaggageDropId(this Guid uuid) => new BaggageDropId(uuid.ToString("B"));

        public static LuggageId ToLuggageId(this Guid uuid) => new LuggageId(uuid.ToString("B"));
    }
}

namespace DataCatalague.Api.Domain.Commands
{

    public static class BaggageDropCommands
    {
        public record CreateCheckInCounter(Guid Uuid, string DisplayName, string? Description = default);

        public record DropOffLuggage(Guid Uuid, string FileName, long FileLength);
    }

}

namespace DataCatalague.Api.Domain.Events
{
    public static class BaggageDropEvents
    {
        public static class V1
        {
            [EventType("V1.CheckInCounterCreated")]
            public record CheckInCounterCreated(
                    Guid Uuid,
                    string DisplayName,
                    string? Description,
                    DateTimeOffset CreatedUTC
                );

            [EventType("V1.LuggageDroppedOff")]
            public record LuggageDroppedOff(
                    Guid Uuid,
                    string FileName, 
                    long FileLength,
                    DateTimeOffset CreatedUTC
                );
        }
    }
}
