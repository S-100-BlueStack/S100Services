import { TIMELINE_MODE } from "../model/timelineTypes.js";

export { fetchProductHistory } from "./productHistoryApi.js";

export async function fetchMapTimelineMetadata() {
  return {
    endpointAvailable: false,
    mode: TIMELINE_MODE.SNAPSHOT,
    fullTimeExtent: null,
    stops: [],
  };
}

export async function fetchMapSnapshotAtTime(timestamp) {
  if (timestamp == null || timestamp === "") {
    throw new Error("timestamp is required to fetch a map snapshot.");
  }

  return {
    endpointAvailable: false,
    timestamp,
    layers: [],
  };
}
