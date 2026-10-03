using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class BaggageDropCommandService : CommandService<BaggageDrop, BaggageDropState, BaggageDropId>
    {
        public BaggageDropCommandService(IEventStore store) : base(store) {
            On<BaggageDropCommands.CreateCheckInCounter>()
                .InState(ExpectedState.New)
                .GetId(cmd => cmd.Uuid.ToBaggageDropId())
                .ActAsync(
                    (counter, cmd, _) => counter.Create(cmd.Uuid, cmd.DisplayName, cmd.Description)
                );
        }
    }

    public class LuggageCommandService : CommandService<Luggage, LuggageState, LuggageId>
    {
        public LuggageCommandService(IEventStore store) : base(store) {
            On<BaggageDropCommands.DropOffLuggage>()
                .InState(ExpectedState.New)
                .GetId(cmd => cmd.Uuid.ToLuggageId())
                .ActAsync(
                    (luggage, cmd, _) => luggage.Upload(cmd.Uuid, cmd.FileName,cmd.FileLength)
                );
        }
    }
}
