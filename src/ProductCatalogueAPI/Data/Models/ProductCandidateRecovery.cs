namespace ProductCatalogueAPI.Data.Models;

/// <summary>Shared pre-send guards for one independently owned Product candidate.</summary>
public static class ProductCandidateRecovery
{
    /// <summary>Only final, unsent candidates can be acknowledged or discarded.</summary>
    public static bool CanDiscard(ProductState state, ProductState? previousState, int? edition, int? update) =>
        edition.HasValue == update.HasValue &&
        state is (ProductState.ReadyForDistribution or ProductState.Error) &&
        (edition.HasValue || state == ProductState.Error) &&
        previousState is not (ProductState.Frozen or ProductState.Exporting or ProductState.Validating or
            ProductState.InTransit or ProductState.ReadyForDistribution or ProductState.AcceptedForDistribution or ProductState.Published);

    /// <summary>
    /// A retry of a failed candidate may have inherited an old Error/Rejected marker.
    /// Such a marker is not a stable previous workflow state to restore after Discard.
    /// </summary>
    public static ProductState RestoredState(ProductState? previousState) =>
        previousState is null or ProductState.Error or ProductState.Rejected
            ? ProductState.Idle
            : previousState.Value;

    /// <summary>Carry the original state through a failed pre-send candidate replacement.</summary>
    public static ProductState PreviousStateForReplacement(ProductState current, ProductState? previous) =>
        current is ProductState.Error or ProductState.Rejected
            ? RestoredState(previous)
            : current;
}
