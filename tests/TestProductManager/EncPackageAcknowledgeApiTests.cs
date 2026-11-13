using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using ProductCatalogueAPI.Controllers;
using ProductCatalogueAPI.Data.Models;
using ProductCatalogueAPI.Services.Operations;
using System.Reflection;
using System.Security.Claims;

namespace TestProductCatalogueAPI;

/// <summary>Checks the HTTP contract for acknowledging failures without any Hangfire, database or GUI dependency.</summary>
public sealed class EncPackageAcknowledgeApiTests
{
    /// <summary>The operator identity is server-owned and retries return the original receipt.</summary>
    [Theory]
    [InlineData(EncPackageFailureAcknowledgementStatus.Acknowledged, false)]
    [InlineData(EncPackageFailureAcknowledgementStatus.AlreadyAcknowledged, true)]
    public async Task AcknowledgementReturnsItsStableReceiptAndAuthenticatedActor(EncPackageFailureAcknowledgementStatus status, bool replay) {
        var cutoff = new DateTime(2026, 11, 12, 14, 0, 0, DateTimeKind.Utc);
        var actions = new Actions { Result = new(status, cutoff) };
        var controller = Controller(actions);
        var packageId = Guid.NewGuid();
        var result = Assert.IsType<OkObjectResult>(await controller.Acknowledge("101DK0041335E", new(packageId), default));
        Assert.Equal("DOMAIN\\tester", actions.Actor);
        Assert.Equal(packageId, actions.PackageId);
        Assert.Equal(cutoff, Property<DateTime?>(result.Value!, "acknowledgedAtUtc"));
        Assert.Equal(replay, Property<bool>(result.Value!, "alreadyAcknowledged"));
    }

    /// <summary>A stale or ineligible package produces a conflict without implying a reset succeeded.</summary>
    [Fact]
    public async Task IneligiblePackageReturnsConflict() {
        var actions = new Actions();
        Assert.IsType<ConflictObjectResult>(await Controller(actions).Acknowledge("101DK0041335E", new(Guid.NewGuid()), default));
    }

    /// <summary>Missing identities and disabled actions do not invoke the application mutation.</summary>
    [Fact]
    public async Task InvalidAndDisabledRequestsNeverMutate() {
        var actions = new Actions();
        var controller = Controller(actions);
        Assert.IsType<BadRequestObjectResult>(await controller.Acknowledge("101DK0041335E", new(Guid.Empty), default));
        Assert.Equal(0, actions.Calls);
        actions.Enabled = false;
        Assert.Equal(503, Assert.IsType<ObjectResult>(await controller.Acknowledge("101DK0041335E", new(Guid.NewGuid()), default)).StatusCode);
        Assert.Equal(0, actions.Calls);
    }

    /// <summary>Failure retirement uses the existing manage permission rather than a provider acceptance credential.</summary>
    [Fact]
    public void AcknowledgeRequiresTheManagePolicy() => Assert.Contains(typeof(EncPackageActionsController).GetMethod(nameof(EncPackageActionsController.Acknowledge))!.GetCustomAttributes<AuthorizeAttribute>(), attribute => attribute.Policy == "productmanager:manage");

    /// <summary>Creates the controller with an authenticated server identity.</summary>
    private static EncPackageActionsController Controller(Actions actions) => new(actions) {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "DOMAIN\\tester")], "test")) } }
    };

    /// <summary>Reads the anonymous HTTP response without coupling tests to JSON casing options.</summary>
    private static T Property<T>(object value, string name) => (T)value.GetType().GetProperty(name)!.GetValue(value)!;

    /// <summary>Records only the requested application call; no real state or provider decisions are changed.</summary>
    private sealed class Actions : IEncPackageActionService
    {
        public bool Enabled { get; set; } = true;
        public EncPackageFailureAcknowledgementResult Result { get; set; } = new(EncPackageFailureAcknowledgementStatus.Conflict);
        public string? Actor { get; private set; }
        public Guid PackageId { get; private set; }
        public int Calls { get; private set; }
        public Task<EncPackageFailureAcknowledgementResult> AcknowledgeFailureAsync(string sourceName, Guid packageId, string actor, CancellationToken cancellationToken = default) {
            Calls++; PackageId = packageId; Actor = actor; return Task.FromResult(Result);
        }
        public Task<EncPackageActionSnapshot?> ReadAsync(string sourceName, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<EncPackagePauseWriteResult> SetPausedAsync(string sourceName, Guid packageId, byte[]? version, bool paused, CancellationToken cancellationToken = default) => throw new NotSupportedException();
        public Task<string?> QueueDiscardAsync(string sourceName, Guid packageId, CancellationToken cancellationToken = default) => throw new NotSupportedException();
    }
}
