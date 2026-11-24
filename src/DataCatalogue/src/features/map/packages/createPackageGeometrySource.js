// Keep Package reads independent from Workspace coverage and from assignment drafts.
// The API has no geometry version/ETag, so each new selection is fetched afresh.
export function createPackageGeometrySource({ catalogue, requestTimeoutMs = 20_000 }) {
  if (typeof catalogue?.packageGeometry !== "function") {
    throw new Error("Package geometry API is unavailable.");
  }
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error("Package geometry timeout must be positive.");
  }

  return {
    async load(packageId, { signal } = {}) {
      signal?.throwIfAborted();
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), requestTimeoutMs);
      const readSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
      try {
        const result = await catalogue.packageGeometry(packageId, { signal: readSignal });
        signal?.throwIfAborted();
        if (timeout.signal.aborted) {
          throw new Error(
            "Package geometry request timed out. Retry the map or reselect the Package."
          );
        }
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        if (timeout.signal.aborted) {
          throw new Error(
            "Package geometry request timed out. Retry the map or reselect the Package.",
            { cause: error }
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
