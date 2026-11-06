namespace TestProductCatalogueAPI;

/// <summary>Verifies snapshot build time independently of archive cutoffs and published catalogue metadata.</summary>
public sealed class EncPackageBuildTimestampTests
{
    /// <summary>A slow snapshot records its creation time without moving the archive scan boundary.</summary>
    [Fact]
    public async Task SnapshotCreationTimeIsSeparateFromTheArchiveCutoff() {
        var fixture = await DpcRunFixture.CreateAsync();
        fixture.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.A, DpcRunFixture.Utc(9), 67);
        fixture.BeforeSnapshot = () => fixture.Clock.Now = DpcRunFixture.Utc(11);
        await fixture.RunAsync();
        var package = Assert.Single(fixture.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(10), package.DetectedAtUtc);
        Assert.Equal(DpcRunFixture.Utc(11), package.BuiltAtUtc);
        Assert.Equal(DateTimeKind.Utc, package.BuiltAtUtc!.Value.Kind);
        Assert.Equal(0, fixture.PublicationCalls);
    }

    /// <summary>Only a saved replacement changes BuiltAtUtc; ordinary no-change scans retain it.</summary>
    [Fact]
    public async Task NewChangesRefreshBuildTimeAndNoChangeScansRetainIt() {
        var fixture = await DpcRunFixture.CreatedPackageAsync();
        var first = fixture.Packages.Active[DpcRunFixture.Source];
        fixture.Clock.Now = DpcRunFixture.Utc(12);
        fixture.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 67);
        await fixture.RunAsync();
        var replacement = fixture.Packages.Active[DpcRunFixture.Source];
        Assert.NotEqual(first.Id, replacement.Id);
        Assert.Equal(DpcRunFixture.Utc(12), replacement.BuiltAtUtc);
        Assert.True(replacement.BuiltAtUtc > first.BuiltAtUtc);
        fixture.Clock.Now = DpcRunFixture.Utc(14);
        await fixture.RunAsync();
        Assert.Same(replacement, fixture.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(12), replacement.BuiltAtUtc);
        Assert.Equal(0, fixture.PublicationCalls);
    }

    /// <summary>A failed replacement must not relabel the retained snapshot as a newly built package.</summary>
    [Fact]
    public async Task FailedReplacementPreservesTheExistingBuildTime() {
        var fixture = await DpcRunFixture.CreatedPackageAsync();
        var first = fixture.Packages.Active[DpcRunFixture.Source];
        fixture.Clock.Now = DpcRunFixture.Utc(12);
        fixture.Archive.Edit(DpcRunFixture.Source, DpcRunFixture.B, DpcRunFixture.Utc(11), 67);
        fixture.FailSnapshotSource = DpcRunFixture.Source;
        await fixture.RunAsync();
        Assert.Same(first, fixture.Packages.Active[DpcRunFixture.Source]);
        Assert.Equal(DpcRunFixture.Utc(10), first.BuiltAtUtc);
        Assert.Equal(0, fixture.PublicationCalls);
    }

    /// <summary>Manual exports record the same shared-snapshot timestamp without publishing S-128 metadata.</summary>
    [Fact]
    public async Task ManualPackageHasItsOwnBuildTime() {
        var fixture = await DpcRunFixture.CreateAsync();
        fixture.BeforeSnapshot = () => fixture.Clock.Now = DpcRunFixture.Utc(11);
        await fixture.ManualAsync();
        var package = Assert.Single(fixture.Packages.Active.Values);
        Assert.Equal(DpcRunFixture.Utc(11), package.BuiltAtUtc);
        Assert.Equal(DpcRunFixture.Utc(10), package.DetectedAtUtc);
        Assert.Equal(0, fixture.PublicationCalls);
    }
}
