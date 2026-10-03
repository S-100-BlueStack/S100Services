using DataCatalague.Api.Domain;
using Eventuous;

namespace DataCatalague.Api.Services
{
    public class LuggageCommandService : CommandService<Luggage, LuggageState, LuggageId>
    {
        public LuggageCommandService(IEventStore store) : base(store) {
            On<LuggageCommands.Create>()
                .InState(ExpectedState.New)
                .GetId(cmd => cmd.Uuid.ToLuggageId())
                .ActAsync(
                    (luggage, cmd, _) => luggage.Create(cmd.Uuid, cmd.DisplayName, cmd.Description)
                );
        }
    }
}
