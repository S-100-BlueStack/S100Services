using DataCatalague.Api.Domain;
using DataCatalague.Api.Domain.Commands;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class CheckInCounterCommandService : CommandService<CheckInCounter, CheckInCounterState, CheckInCounterId>
    {
        public CheckInCounterCommandService(IEventStore store) : base(store) {
            On<LuggageCommands.CreateCheckInCounter>()
                .InState(ExpectedState.New)
                .GetId(cmd => cmd.Uuid.ToCheckInCounterId())
                .ActAsync(
                    (counter, cmd, _) => counter.Create(cmd.Uuid, cmd.DisplayName, cmd.Description)
                );
        }
    }

    public class LuggageCommandService : CommandService<Luggage, LuggageState, LuggageId>
    {
        public LuggageCommandService(IEventStore store) : base(store) {
            On<LuggageCommands.CheckInLuggage>()
                .InState(ExpectedState.New)
                .GetId(cmd => cmd.Uuid.ToLuggageId())
                .ActAsync(
                    (luggage, cmd, _) => luggage.Upload(cmd.Uuid, cmd.FileName,cmd.FileLength)
                );
        }
    }
}
