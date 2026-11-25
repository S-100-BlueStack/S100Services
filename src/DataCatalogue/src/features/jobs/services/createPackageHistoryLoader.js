import { severityLabel } from "../../../shared/domain/severity.js";
import { isDirectoryActor } from "../../../shared/api/actorProfile.js";
import { historyActorLabel, historyTimeLabel } from "../../../shared/domain/historyPresentation.js";

const TITLES = Object.freeze({
  packageCreated: "Package created",
  severityUpdated: "Severity recorded",
  detailedGeometryAdded: "Detailed geometry added",
  geometryReplaced: "Package geometry replaced",
  pipelineAssigned: "Workstream assigned",
  pipelineUnassigned: "Workstream unassigned",
  bindingCommentAdded: "Binding comment added",
});

function presentEvent(event) {
  return {
    id: event.id,
    dateTime: event.occurredAtUtc,
    timeLabel: historyTimeLabel(event.occurredAtUtc),
    title: TITLES[event.eventType],
    actor: historyActorLabel(event.actor),
    actorIdentity: event.actor,
    ...(event.commentText ? { commentText: event.commentText } : {}),
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
export function createPackageHistoryLoader({ read, readProfile, onChange = () => {} } = {}) {
  let state = initialState();
  let generation = 0;
  let pending = null;
  let alive = true;
  let failedBefore = null;
  let profileRequest = null;
  const profiles = new Map();

  function publish(patch) {
    state = { ...state, ...patch };
    onChange(state);
  }

  const actorKey = (entry) =>
    isDirectoryActor(entry.actorIdentity) ? entry.actorIdentity.toUpperCase() : null;

  function withProfile(entry) {
    const profile = profiles.get(actorKey(entry));
    return profile ? { ...entry, profile } : entry;
  }

  // A separate best-effort read must never hold up the history page, mark it
  // failed, or publish an older selection. Limit parallel profile requests.
  async function enrich(owner, packageId) {
    if (!alive || owner !== generation || typeof readProfile !== "function") return;
    const unique = new Map();
    for (const entry of state.entries) {
      const key = actorKey(entry);
      if (key && !profiles.has(key) && !unique.has(key)) unique.set(key, entry);
    }
    if (!unique.size) return;
    const request = new AbortController();
    profileRequest = request;
    const queue = [...unique];
    let index = 0;
    const isCurrent = () => alive && owner === generation && !request.signal.aborted;
    async function worker() {
      while (isCurrent() && index < queue.length) {
        const [key, entry] = queue[index++];
        let profile = null;
        try {
          profile = await readProfile(packageId, entry.id, {
            actor: entry.actorIdentity,
            signal: request.signal,
          });
        } catch {
          // Enrichment is optional, including older API deployments and AD outages.
        }
        if (!isCurrent()) return;
        profiles.set(key, profile);
        if (profile) {
          publish({
            entries: state.entries.map((item) =>
              actorKey(item) === key ? withProfile(item) : item
            ),
          });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    if (profileRequest === request) profileRequest = null;
  }

  async function load(before = null) {
    if (!alive || !state.packageId || pending || typeof read !== "function") return;
    const packageId = state.packageId;
    const owner = ++generation;
    profileRequest?.abort();
    profileRequest = null;
    // Explicit Refresh permits retrying failed/expired directory reads.
    if (!before) profiles.clear();
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
        entries: [...previous, ...entries].map(withProfile),
        nextBefore: result.nextBefore,
        isLoading: false,
        hasLoaded: true,
        error: null,
      });
      void enrich(owner, packageId);
    } catch (error) {
      if (!alive || owner !== generation || request.signal.aborted) return;
      pending = null;
      publish({
        isLoading: false,
        error: error?.message || "Package history could not be loaded.",
      });
      void enrich(owner, packageId);
    }
  }

  function select(packageId) {
    if (!alive || state.packageId === packageId) return;
    generation++;
    pending?.abort();
    pending = null;
    profileRequest?.abort();
    profileRequest = null;
    profiles.clear();
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
      profileRequest?.abort();
      profileRequest = null;
      profiles.clear();
      state = initialState();
    },
  };
}
