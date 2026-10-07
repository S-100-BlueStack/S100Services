export function createPackagePopupSnapshotSynchronization({
  graphic,
  productContext,
  isConnected,
  getAttributes,
  publish,
  onInvalid,
  onSourcePublication,
}) {
  const layer = graphic?.layer;
  const source = layer?.appSourceDefinition;
  const identityKey = graphic?.attributes?.productIdentityKey;
  const isCurrent = () => {
    const attributes = graphic?.attributes;
    const graphics = layer?.graphics?.toArray?.() ?? layer?.graphics;
    return Boolean(
      isConnected() &&
      graphic?.layer === layer &&
      layer?.appSourceDefinition === source &&
      layer?.visible !== false &&
      graphic?.visible !== false &&
      (!graphics || Array.from(graphics).includes(graphic)) &&
      attributes?.sourceId === productContext?.sourceId &&
      attributes?.productKey === productContext?.productKey &&
      attributes?.productIdentityKey === identityKey &&
      sameDataset(attributes?.datasetName, productContext?.datasetName)
    );
  };
  return {
    isCurrent,
    synchronize() {
      if (!isCurrent()) {
        onInvalid?.();
        return false;
      }
      // Reconciliation replaces AOI attributes. Retain only the session's read
      // overlay, never its old map status, identity or current member metadata.
      const attributes = { ...graphic.attributes };
      if (!Object.hasOwn(attributes, "exportMetadata")) {
        const previous = getAttributes();
        if (Object.hasOwn(previous, "exportMetadata")) {
          attributes.exportMetadata = previous.exportMetadata;
        }
      }
      // Source state committed after an older detail request must supersede
      // that entire result through the popup's existing publication generation.
      onSourcePublication?.();
      publish(attributes);
      return true;
    },
  };
}

function sameDataset(left, right) {
  const normalize = (value) =>
    String(value ?? "")
      .trim()
      .toUpperCase();
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}
