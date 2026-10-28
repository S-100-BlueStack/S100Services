// Reconcile only the selection that is still open when a source commits. No
// captured asynchronous session may reopen a closed or replaced popup.
export function reconcileSourceInteractions({
  sourceId,
  layers,
  view,
  hoverManager,
  refreshPopup,
}) {
  const graphics = (layers ?? []).flatMap((layer) =>
    Array.from(layer.graphics?.toArray?.() ?? layer.graphics ?? [])
  );
  const popup = view?.popup;
  const selected = popup?.selectedFeature;
  if (popup?.visible && selected?.attributes?.sourceId === sourceId) {
    const identity = selected.attributes.productIdentityKey;
    const replacement = graphics.find(
      (graphic) => identity && graphic.attributes?.productIdentityKey === identity
    );
    if (replacement && replacement.visible !== false) {
      if (replacement !== selected) {
        popup.open({ features: [replacement], location: popup.location });
      } else {
        void refreshPopup?.(selected.attributes.datasetName, { showFailureNotice: false });
      }
    } else {
      popup.close();
    }
  }

  if (hoverManager?.getLockedSourceId?.() === sourceId) {
    const featureKey = hoverManager.getLockedFeatureKey?.();
    const replacement = graphics.find(
      (graphic) => featureKey && graphic.attributes?.featureKey === featureKey
    );
    if (replacement && replacement.visible !== false) {
      hoverManager.setLockedFeature?.(replacement);
    } else {
      hoverManager.clearLockedFeature?.();
    }
  }
}
