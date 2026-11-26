import { bindingCommentKey } from "../../../shared/api/bindingComments.js";
import { isDirectoryActor } from "../../../shared/api/actorProfile.js";
import { historyActorLabel, historyTimeLabel } from "../../../shared/domain/historyPresentation.js";

function initialState(binding = null) {
  return { binding, entries: [], nextBefore: null, loading: false, loaded: false, error: null };
}

function sortTimestamp(value) {
  // Preserve sub-millisecond precision used by the server's timestamp and GUID sort.
  const [seconds, fraction = ""] = value.replace(/(?:Z|\+00:00)$/, "").split(".");
  return seconds + fraction.padEnd(7, "0");
}

function presentComment(item) {
  return {
    id: item.id,
    dateTime: item.occurredAtUtc,
    timeLabel: historyTimeLabel(item.occurredAtUtc),
    text: item.text,
    context: { scope: "binding", pipelineId: item.pipelineId },
    actor: historyActorLabel(item.actor),
    actorIdentity: item.actor,
    historyEventId: item.historyEventId,
  };
}

const actorKey = (entry) => entry.actorIdentity.toUpperCase();

export function createPackageCommentViewerLoader({
  read,
  readProfile,
  observeFirstPage,
  onChange,
}) {
  let state = initialState();
  let owner = null;
  let pending = false;
  let failedBefore = null;

  function publish(patch) {
    state = { ...state, ...patch };
    onChange(state);
  }

  function renew() {
    owner?.controller.abort();
    owner = {
      controller: new AbortController(),
      profiles: new Map(),
      queued: [],
      running: 0,
    };
    return owner;
  }

  function enrich(current, packageId) {
    if (!readProfile) return;
    const { controller, profiles, queued } = current;
    for (const entry of state.entries) {
      if (!entry.historyEventId || !isDirectoryActor(entry.actorIdentity)) continue;
      const key = actorKey(entry);
      if (profiles.has(key)) continue;
      profiles.set(key, null);
      queued.push(entry);
    }

    async function worker() {
      current.running++;
      try {
        while (owner === current && queued.length) {
          const entry = queued.shift();
          let profile;
          try {
            profile = await readProfile(packageId, entry.historyEventId, {
              actor: entry.actorIdentity,
              signal: controller.signal,
            });
          } catch {
            // The recorded account remains available when optional enrichment fails.
          }
          if (owner !== current) return;
          const key = actorKey(entry);
          profiles.set(key, profile);
          if (profile) {
            publish({
              entries: state.entries.map((item) =>
                actorKey(item) === key ? { ...item, profile } : item
              ),
            });
          }
        }
      } finally {
        current.running--;
      }
    }

    const capacity = Math.min(4 - current.running, queued.length);
    for (let index = 0; index < capacity; index++) void worker();
  }

  async function load(before = null) {
    if (!state.binding || pending) return;
    const current = before ? owner : renew();
    const { packageId, pipelineId } = state.binding;
    const observe = before ? null : observeFirstPage(state.binding);
    pending = true;
    failedBefore = before;
    publish({ loading: true, error: null });
    try {
      const result = await read(packageId, {
        pipelineId,
        before,
        signal: current.controller.signal,
      });
      if (current !== owner) return;
      const previous = before ? state.entries : [];
      const ids = new Set(previous.map((entry) => entry.id));
      if (result.items.some((item) => item.pipelineId !== pipelineId)) {
        throw new Error("The API returned comments for a different Workstream.");
      }
      const added = result.items.map(presentComment);
      let last = previous.at(-1);
      for (const entry of added) {
        if (
          ids.has(entry.id) ||
          (last &&
            sortTimestamp(entry.dateTime) + entry.id >= sortTimestamp(last.dateTime) + last.id)
        ) {
          throw new Error("Comments changed during paging. Refresh comments.");
        }
        ids.add(entry.id);
        last = entry;
      }
      if (
        result.nextBefore &&
        (result.nextBefore === before || result.nextBefore !== added.at(-1)?.id)
      ) {
        throw new Error("Invalid comment continuation. Refresh comments.");
      }
      observe?.(added.length > 0);
      publish({
        entries: [...previous, ...added].map((entry) => {
          const profile = current.profiles.get(actorKey(entry));
          return profile ? { ...entry, profile } : entry;
        }),
        nextBefore: result.nextBefore,
        loading: false,
        loaded: true,
      });
      enrich(current, packageId);
    } catch (error) {
      if (current !== owner) return;
      publish({ loading: false, error: error?.message || "Comments could not be loaded." });
    } finally {
      if (current === owner) pending = false;
    }
  }

  function select(binding) {
    if (
      binding &&
      state.binding &&
      bindingCommentKey(state.binding) === bindingCommentKey(binding)
    ) {
      return;
    }
    if (!binding && !state.binding) return;
    owner?.controller.abort();
    owner = null;
    pending = false;
    failedBefore = null;
    state = initialState(binding);
    if (binding) return load();
    onChange(state);
  }

  return {
    getSnapshot: () => state,
    select,
    refresh: () => load(),
    loadOlder: () => state.nextBefore && load(state.nextBefore),
    retry: () => load(failedBefore),
  };
}
