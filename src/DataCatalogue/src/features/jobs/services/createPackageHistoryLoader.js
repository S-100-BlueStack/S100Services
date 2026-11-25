import { severityLabel } from "../../../shared/domain/severity.js";

const TITLES = Object.freeze({
  packageCreated: "Package created",
  severityUpdated: "Severity recorded",
  detailedGeometryAdded: "Detailed geometry added",
  geometryReplaced: "Package geometry replaced",
  pipelineAssigned: "Workstream assigned",
  pipelineUnassigned: "Workstream unassigned",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function presentEvent(event) {
  return {
    id: event.id,
    dateTime: event.occurredAtUtc,
    timeLabel: `${TIME.format(new Date(event.occurredAtUtc))} UTC`,
    title: TITLES[event.eventType],
    actor: event.actor ?? "Actor not recorded",
    context: event.pipelineId
      ? `Workstream: ${event.pipelineName ?? event.pipelineId}`
      : event.severity !== null
        ? severityLabel(event.severity)
        : null,
  };
}

function initialState(packageId = null, available = false) {
  return {
    packageId,
    available,
    entries: [],
    nextBefore: null,
    isLoading: false,
    hasLoaded: false,
    error: null,
  };
}

// Selection is supplied by the Details owner. Only this loader owns request
// generation, continuation and history state; it never publishes Job/map state.
export function createPackageHistoryLoader({ read, onChange = () => {} } = {}) {
  let state = initialState();
  let generation = 0;
  let pending = null;
  let alive = true;
  let failedBefore = null;

  function publish(patch) {
    state = { ...state, ...patch };
    onChange(state);
  }

  async function load(before = null) {
    if (!alive || !state.packageId || pending || typeof read !== "function") return;
    const packageId = state.packageId;
    const owner = ++generation;
    const request = new AbortController();
    pending = request;
    failedBefore = before;
    publish({ isLoading: true });
    try {
      const result = await read(packageId, { before, signal: request.signal });
      if (!alive || owner !== generation || request.signal.aborted) return;
      const entries = result.items.map(presentEvent);
      const previous = before ? state.entries : [];
      const ids = new Set(previous.map((entry) => entry.id));
      for (const entry of entries) {
        if (ids.has(entry.id))
          throw new Error("Package history changed during paging. Reload history.");
        ids.add(entry.id);
      }
      if (before && result.nextBefore === before) {
        throw new Error("Package history continuation did not advance. Reload history.");
      }
      if (
        previous.length &&
        entries.length &&
        Date.parse(entries[0].dateTime) > Date.parse(previous.at(-1).dateTime)
      ) {
        throw new Error("Package history changed during paging. Reload history.");
      }
      pending = null;
      publish({
        entries: [...previous, ...entries],
        nextBefore: result.nextBefore,
        isLoading: false,
        hasLoaded: true,
        error: null,
      });
    } catch (error) {
      if (!alive || owner !== generation || request.signal.aborted) return;
      pending = null;
      publish({
        isLoading: false,
        error: error?.message || "Package history could not be loaded.",
      });
    }
  }

  function select(packageId) {
    if (!alive || state.packageId === packageId) return;
    generation++;
    pending?.abort();
    pending = null;
    failedBefore = null;
    state = initialState(packageId, typeof read === "function");
    if (packageId && typeof read === "function") void load();
    else if (packageId) publish({ error: "Package history is unavailable." });
  }

  return {
    getSnapshot: () => state,
    select,
    refresh: () => load(),
    loadOlder: () => state.nextBefore && load(state.nextBefore),
    retry: () => load(failedBefore),
    destroy() {
      alive = false;
      generation++;
      pending?.abort();
      pending = null;
      state = initialState();
    },
  };
}
