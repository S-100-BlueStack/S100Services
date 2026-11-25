using DataCatalague.Api.Models.V1;
using DataCatalague.Api.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace DataCatalogue.Api.Tests.Unit;

public sealed class ActorProfileTests
{
    private sealed class DirectoryStub(Func<string, ActorProfileResponse?> find) : IActorProfileDirectory
    {
        private int _calls;
        public int Calls => Volatile.Read(ref this._calls);
        public ActorProfileResponse? Find(string actor) {
            Interlocked.Increment(ref this._calls);
            return find(actor);
        }
    }

    [Fact]
    public async Task Profiles_are_cached_by_full_account_and_missing_profiles_are_cached_too() {
        var directory = new DirectoryStub(actor => actor.StartsWith("PROD", StringComparison.OrdinalIgnoreCase)
            ? new ActorProfileResponse(actor, "Example user", null, null) : null);
        using var service = new ActorProfileService(directory, NullLogger<ActorProfileService>.Instance);
        Assert.Equal("Example user", (await service.GetAsync(@"PROD\B123456", default))!.DisplayName);
        Assert.Equal(@"prod\b123456", (await service.GetAsync(@"prod\b123456", default))!.Actor);
        Assert.Null(await service.GetAsync(@"OTHER\B123456", default));
        Assert.Null(await service.GetAsync(@"other\b123456", default));
        Assert.Equal(2, directory.Calls);
    }

    [Fact]
    public async Task System_unknown_and_unqualified_accounts_never_query_the_directory() {
        var directory = new DirectoryStub(_ => throw new InvalidOperationException());
        using var service = new ActorProfileService(directory, NullLogger<ActorProfileService>.Instance);
        foreach (var actor in new string?[] { null, "System", "B123456", @"PROD\*", @"PROD\B123456\other", "PROD\\B123456\n" }) {
            Assert.Null(await service.GetAsync(actor, default));
        }
        Assert.Equal(0, directory.Calls);
    }

    [Fact]
    public async Task Directory_failure_is_a_cached_missing_profile_not_a_history_failure() {
        var directory = new DirectoryStub(_ => throw new InvalidOperationException("Directory unavailable"));
        using var service = new ActorProfileService(directory, NullLogger<ActorProfileService>.Instance);
        Assert.Null(await service.GetAsync(@"PROD\B123456", default));
        Assert.Null(await service.GetAsync(@"PROD\B123456", default));
        Assert.Equal(1, directory.Calls);
    }

    [Fact]
    public async Task Shared_lookup_survives_one_readers_cancellation() {
        using var release = new ManualResetEventSlim(false);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var directory = new DirectoryStub(actor => {
            entered.TrySetResult();
            if (!release.Wait(TimeSpan.FromSeconds(10))) { throw new TimeoutException(); }
            return new ActorProfileResponse(actor, "Example user", null, null);
        });
        using var service = new ActorProfileService(directory, NullLogger<ActorProfileService>.Instance);
        using var cancellation = new CancellationTokenSource();
        try {
            var first = service.GetAsync(@"PROD\B123456", cancellation.Token);
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(5));
            var second = service.GetAsync(@"prod\b123456", default);
            cancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => first);
            release.Set();
            Assert.Equal("Example user", (await second)!.DisplayName);
            Assert.Equal(1, directory.Calls);
        }
        finally { release.Set(); }
    }

    [Fact]
    public async Task Directory_concurrency_is_bounded_even_when_readers_cancel() {
        using var release = new ManualResetEventSlim(false);
        var directory = new DirectoryStub(actor => {
            if (!release.Wait(TimeSpan.FromSeconds(10))) { throw new TimeoutException(); }
            return new ActorProfileResponse(actor, "Example user", null, null);
        });
        using var service = new ActorProfileService(directory, NullLogger<ActorProfileService>.Instance);
        using var cancellation = new CancellationTokenSource();
        var tasks = Enumerable.Range(1, 4).Select(index => service.GetAsync($@"PROD\B{index}", cancellation.Token)).ToArray();
        try {
            cancellation.Cancel();
            foreach (var task in tasks) { await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task); }
            Assert.Null(await service.GetAsync(@"PROD\B5", default));
        }
        finally { release.Set(); }
        // Join the still-running shared lookups before disposing the stub gate.
        foreach (var index in Enumerable.Range(1, 4)) {
            Assert.NotNull(await service.GetAsync($@"PROD\B{index}", default));
        }
        Assert.Equal(4, directory.Calls);
    }

    [Fact]
    public void Photo_projection_only_emits_bounded_jpeg_or_png_data() {
        const string actor = @"PROD\B123456";
        Assert.Null(ActiveDirectoryActorProfileDirectory.CreateProfile(actor, " ", null));
        Assert.Null(ActiveDirectoryActorProfileDirectory.CreateProfile(actor, null, new byte[102401]));
        var nameOnly = ActiveDirectoryActorProfileDirectory.CreateProfile(actor, " Example user ", "<svg/>"u8.ToArray());
        Assert.Equal("Example user", nameOnly!.DisplayName);
        Assert.Null(nameOnly.PhotoBase64);
        var photo = new byte[] { 0xFF, 0xD8, 0xFF, 0x00 };
        var profile = ActiveDirectoryActorProfileDirectory.CreateProfile(actor, null, photo);
        Assert.Equal("image/jpeg", profile!.PhotoMediaType);
        Assert.Equal(Convert.ToBase64String(photo), profile.PhotoBase64);
        var png = ActiveDirectoryActorProfileDirectory.CreateProfile(actor, null, new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A });
        Assert.Equal("image/png", png!.PhotoMediaType);
    }
}
