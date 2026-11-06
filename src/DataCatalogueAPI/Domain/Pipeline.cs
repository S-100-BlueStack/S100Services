using Eventuous;
using static DataCatalague.Api.Domain.PipelineEvents;

namespace DataCatalague.Api.Domain
{
    /// <summary>A pipeline work area with optional ownership by a normalized username.</summary>
    public record Workspace(string DisplayName, DisplayScale DisplayScale, string GeometryRef)
    {
        // The coverage GlobalID remains stable when a workspace is renamed in future.
        public string Id => Guid.Parse(GeometryRef[(GeometryRef.IndexOf("::", StringComparison.Ordinal) + 2)..]).ToString("D");
        /// <summary>The normalized account name, or null when unassigned.</summary>
        public string? Owner { get; init; }
        public DateTimeOffset? LockedAtUtc { get; init; }
    }

    public sealed class WorkspaceConflictException(string message) : Exception(message);

    public record PipelineId(string Value) : Id(Value);

    public record PipelineState : State<PipelineState>
    {
        public PipelineId? Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string? Description { get; set; } = string.Empty;

        public Workspace[] Workspaces = [];

        public DateTimeOffset LastUpdatedUtc { get; set; }

        public PipelineState() {
            this.On<V1.PipelineCreated>(Created);
            this.On<V1.WorkspaceAdded>(WorkspaceAdded);
            this.On<V1.WorkspaceLocked>((state, e) => state with {
                Workspaces = state.Workspaces.Select(w => w.Id == e.WorkspaceId ? w with { Owner = e.Owner, LockedAtUtc = e.UTC } : w).ToArray(),
                LastUpdatedUtc = e.UTC,
            });
            this.On<V1.WorkspaceUnlocked>((state, e) => state with {
                Workspaces = state.Workspaces.Select(w => w.Id == e.WorkspaceId ? w with { Owner = null, LockedAtUtc = null } : w).ToArray(),
                LastUpdatedUtc = e.UTC,
            });
        }

        static PipelineState Created(PipelineState state, V1.PipelineCreated e)
            => state with {
                Id = new(e.PipelineId),
                DisplayName = e.DisplayName,
                Description = e.Description,
                LastUpdatedUtc = e.CreatedUTC,
            };

        static PipelineState WorkspaceAdded(PipelineState state, V1.WorkspaceAdded e)
            => state with {
                Workspaces = [.. state.Workspaces, new(e.DisplayName, e.DisplayScale, e.GeometryRef)],
                LastUpdatedUtc = e.UTC,
            };
    }

    public class Pipeline : Aggregate<PipelineState>
    {
        public async Task Create(
                    string PipelineId,
                    string DisplayName,
                    string? Description
            ) {
            this.EnsureDoesntExist();
            this.Apply(new V1.PipelineCreated(PipelineId, DisplayName, Description, DateTime.UtcNow));
        }

        public async Task CreateWorkspace(
                    string DisplayName,
                    DisplayScale DisplayScale,
                    string GeometryRef
            ) {
            this.EnsureExists();
            if (this.State.Workspaces.Any(w => string.Equals(w.DisplayName, DisplayName, StringComparison.OrdinalIgnoreCase))) {
                throw new WorkspaceConflictException("A workspace with this name already exists in the pipeline.");
            }
            this.Apply(new V1.WorkspaceAdded(DisplayName, DisplayScale, GeometryRef, DateTime.UtcNow));
        }

        /// <summary>Claims the workspace, replacing any current owner in one event.</summary>
        public Task LockWorkspace(string workspaceId, string username) {
            this.EnsureExists();
            username = Extensions.NormalizeUserName(username);
            ArgumentException.ThrowIfNullOrWhiteSpace(username);
            var workspace = this.State.Workspaces.SingleOrDefault(w => w.Id == workspaceId)
                ?? throw new KeyNotFoundException("Workspace not found.");
            if (workspace.Owner == username) { return Task.CompletedTask; }
            this.Apply(new V1.WorkspaceLocked(workspaceId, username, DateTimeOffset.UtcNow));
            return Task.CompletedTask;
        }

        /// <summary>Clears the workspace owner regardless of who currently owns it.</summary>
        public Task UnlockWorkspace(string workspaceId, string username) {
            this.EnsureExists();
            username = Extensions.NormalizeUserName(username);
            ArgumentException.ThrowIfNullOrWhiteSpace(username);
            var workspace = this.State.Workspaces.SingleOrDefault(w => w.Id == workspaceId)
                ?? throw new KeyNotFoundException("Workspace not found.");
            if (workspace.Owner is null) { return Task.CompletedTask; }
            this.Apply(new V1.WorkspaceUnlocked(workspaceId, username, DateTimeOffset.UtcNow));
            return Task.CompletedTask;
        }
    }

    public static class PipelineCommands
    {
        public record Create(string PipelineId, string DisplayName, string? Description = default);

        public record CreateWorkspace(string PipelineId, string DisplayName, DisplayScale DisplayScale, string GeometryRef);

        public record LockWorkspace(string PipelineId, string WorkspaceId, string Username);

        public record UnlockWorkspace(string PipelineId, string WorkspaceId, string Username);
    }

    public static class PipelineEvents
    {
        public static class V1
        {
            [EventType("V1.WorkspaceLocked")]
            public record WorkspaceLocked(string WorkspaceId, string Owner, DateTimeOffset UTC);

            [EventType("V1.WorkspaceUnlocked")]
            public record WorkspaceUnlocked(string WorkspaceId, string Username, DateTimeOffset UTC);

            [EventType("V1.PipelineCreated")]
            public record PipelineCreated(
                    string PipelineId,
                    string DisplayName,
                    string? Description,
                    DateTimeOffset CreatedUTC
                );

            [EventType("V1.WorkspaceAdded")]
            public record WorkspaceAdded(
                    string DisplayName,
                    DisplayScale DisplayScale,
                    string GeometryRef,
                    DateTimeOffset UTC
                );
        }
    }

    public static class PipelineExtension
    {
    }
}
