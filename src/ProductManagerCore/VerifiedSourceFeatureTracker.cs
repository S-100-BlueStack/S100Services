namespace S100FC.ProductCatalogue
{
    /// <summary>Verifies which changed source GUIDs actually reached the generated S-101 dataset.</summary>
    internal sealed class VerifiedSourceFeatureTracker
    {
        private readonly string _datasetName;
        private readonly HashSet<string> _required;
        private readonly HashSet<string> _selected = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _emitted = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _collapsed = new(StringComparer.OrdinalIgnoreCase);

        internal VerifiedSourceFeatureTracker(string datasetName, IEnumerable<string> requiredFeatureIds)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(datasetName);
            ArgumentNullException.ThrowIfNull(requiredFeatureIds);

            _datasetName = datasetName;
            _required = new HashSet<string>(requiredFeatureIds, StringComparer.OrdinalIgnoreCase);
            if (_required.Any(string.IsNullOrWhiteSpace))
                throw new ArgumentException("Required source feature IDs must not be empty.", nameof(requiredFeatureIds));
        }

        /// <summary>Records a current feature retrieved from the product's topology selection.</summary>
        internal bool RecordSelected(string sourceFeatureId)
        {
            if (!_required.Contains(sourceFeatureId))
                return false;

            _selected.Add(sourceFeatureId);
            return true;
        }

        /// <summary>Records an intentionally collapsed source feature that cannot be emitted separately.</summary>
        internal void RecordCollapsed(string sourceFeatureId)
        {
            RequireSelected(sourceFeatureId);
            _collapsed.Add(sourceFeatureId);
        }

        /// <summary>Records a source GUID after a generated YAML feature and its geometry were added.</summary>
        internal void RecordEmitted(string sourceFeatureId)
        {
            RequireSelected(sourceFeatureId);
            _emitted.Add(sourceFeatureId);
        }

        /// <summary>Fails closed for selected features lost during conversion, before publishing inclusion results.</summary>
        internal VerifiedSourceFeatureResult Complete()
        {
            var omitted = _required.Where(id => _selected.Contains(id) && !_emitted.Contains(id) && !_collapsed.Contains(id))
                .OrderBy(id => id, StringComparer.OrdinalIgnoreCase).ToArray();
            if (omitted.Length > 0)
                throw new InvalidOperationException(
                    $"Selected S-101 feature(s) were omitted during topology mapping or YAML conversion for '{_datasetName}': {string.Join(", ", omitted)}. DPC preserved its watermark.");

            return new VerifiedSourceFeatureResult(
                _required.Where(_emitted.Contains).OrderBy(id => id, StringComparer.OrdinalIgnoreCase).ToArray(),
                _required.Where(id => !_selected.Contains(id)).OrderBy(id => id, StringComparer.OrdinalIgnoreCase).ToArray(),
                _required.Where(_collapsed.Contains).OrderBy(id => id, StringComparer.OrdinalIgnoreCase).ToArray());
        }

        private void RequireSelected(string sourceFeatureId)
        {
            if (!_selected.Contains(sourceFeatureId))
                throw new InvalidOperationException($"Source feature '{sourceFeatureId}' was not selected for verified export of '{_datasetName}'.");
        }
    }

    internal sealed record VerifiedSourceFeatureResult(
        IReadOnlyList<string> Included,
        IReadOnlyList<string> OutsideSelection,
        IReadOnlyList<string> Collapsed);
}
