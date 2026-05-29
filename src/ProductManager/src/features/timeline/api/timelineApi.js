export async function fetchMapTimelineMetadata() {
  return {
    endpointAvailable: false,
    mode: "snapshot",
    fullTimeExtent: null,
    stops: [],
  };
}

export async function fetchMapSnapshotAtTime(timestamp) {
  if (!timestamp) {
    throw new Error("timestamp is required to fetch a map snapshot.");
  }

  return {
    endpointAvailable: false,
    timestamp,
    layers: [],
  };
}

export async function fetchProductHistory(datasetName) {
  if (!datasetName) {
    throw new Error("datasetName is required to fetch product history.");
  }

  return {
    endpointAvailable: false,
    datasetName,
    events: [],
  };
}
