import { fetchWorkspaceFreshness } from "../api/workspaceFreshnessApi.js";

export const DEFAULT_WORKSPACE_FRESHNESS_INTERVAL_MS = 30_000;

const UNAVAILABLE_REVISION = "__workspace_unavailable__";

export function createWorkspaceFreshnessMonitor({
  getDatasetNames,
  onChanged,
  fetchFreshness = fetchWorkspaceFreshness,
  intervalMs = DEFAULT_WORKSPACE_FRESHNESS_INTERVAL_MS,
  documentRef = globalThis.document,
  setIntervalFn = globalThis.setInterval?.bind(globalThis),
  clearIntervalFn = globalThis.clearInterval?.bind(globalThis),
} = {}) {
  if (typeof getDatasetNames !== "function") {
    throw new TypeError("getDatasetNames must be a function.");
  }
  if (typeof onChanged !== "function") {
    throw new TypeError("onChanged must be a function.");
  }

  let revisions = new Map();
  let intervalId = null;
  let inFlightCheck = null;
  let lifecycleGeneration = 0;
  let recoveryRefreshRequired = false;
  let started = false;
  let disposed = false;

  const prime = async (datasetNames = getDatasetNames()) => {
    const generation = ++lifecycleGeneration;
    const names = normalizeDatasetNames(datasetNames);

    if (disposed) {
      return false;
    }
    if (names.length === 0) {
      revisions = new Map();
      recoveryRefreshRequired = false;
      return true;
    }

    try {
      const items = await fetchFreshness(names);
      if (disposed || generation !== lifecycleGeneration) {
        return false;
      }

      revisions = createRevisionMap(items, names);
      recoveryRefreshRequired = false;
      return true;
    } catch (error) {
      if (!disposed && generation === lifecycleGeneration) {
        revisions = new Map();
        recoveryRefreshRequired = true;
        console.warn("[Workspace freshness] Initial revision check failed", error);
      }
      return false;
    }
  };

  const check = () => {
    if (disposed || isDocumentHidden(documentRef)) {
      return Promise.resolve(false);
    }
    if (inFlightCheck) {
      return inFlightCheck;
    }

    const names = normalizeDatasetNames(getDatasetNames());
    if (names.length === 0) {
      revisions = new Map();
      recoveryRefreshRequired = false;
      return Promise.resolve(true);
    }

    const generation = lifecycleGeneration;
    inFlightCheck = runCheck(names, generation).finally(() => {
      inFlightCheck = null;
    });
    return inFlightCheck;
  };

  const runCheck = async (names, generation) => {
    try {
      const items = await fetchFreshness(names);
      if (disposed || generation !== lifecycleGeneration) {
        return false;
      }

      const nextRevisions = createRevisionMap(items, names);
      const changedDatasetNames = recoveryRefreshRequired
        ? names.filter((datasetName) => nextRevisions.has(normalizeDatasetKey(datasetName)))
        : [];

      for (const datasetName of recoveryRefreshRequired ? [] : names) {
        const key = normalizeDatasetKey(datasetName);
        if (!nextRevisions.has(key)) {
          continue;
        }

        const nextRevision = nextRevisions.get(key);
        if (!revisions.has(key)) {
          revisions.set(key, nextRevision);
          continue;
        }

        if (revisions.get(key) !== nextRevision) {
          changedDatasetNames.push(datasetName);
        }
      }

      pruneRevisions(revisions, names);

      if (changedDatasetNames.length === 0) {
        recoveryRefreshRequired = false;
        return true;
      }

      const accepted = await onChanged(changedDatasetNames);
      if (disposed || generation !== lifecycleGeneration || accepted === false) {
        return false;
      }

      if (recoveryRefreshRequired) {
        revisions = nextRevisions;
        recoveryRefreshRequired = false;
      } else {
        for (const datasetName of changedDatasetNames) {
          const key = normalizeDatasetKey(datasetName);
          if (nextRevisions.has(key)) {
            revisions.set(key, nextRevisions.get(key));
          }
        }
      }

      return true;
    } catch (error) {
      if (!disposed && generation === lifecycleGeneration) {
        console.warn("[Workspace freshness] Revision check failed", error);
      }
      return false;
    }
  };

  const handleVisibilityChange = () => {
    if (!isDocumentHidden(documentRef)) {
      void check();
    }
  };

  const start = () => {
    if (disposed || started) {
      return;
    }

    started = true;
    documentRef?.addEventListener?.("visibilitychange", handleVisibilityChange);
    if (typeof setIntervalFn === "function" && Number.isFinite(intervalMs) && intervalMs > 0) {
      intervalId = setIntervalFn(() => {
        void check();
      }, intervalMs);
    }
  };

  const destroy = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    lifecycleGeneration += 1;
    revisions = new Map();
    recoveryRefreshRequired = false;
    documentRef?.removeEventListener?.("visibilitychange", handleVisibilityChange);
    if (intervalId !== null && typeof clearIntervalFn === "function") {
      clearIntervalFn(intervalId);
    }
    intervalId = null;
    started = false;
  };

  return {
    prime,
    check,
    start,
    destroy,
  };
}

function createRevisionMap(items, requestedDatasetNames) {
  const requestedKeys = new Set(requestedDatasetNames.map(normalizeDatasetKey));
  const revisions = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const key = normalizeDatasetKey(item?.datasetName);
    if (!key || !requestedKeys.has(key)) {
      continue;
    }

    const revision = item?.available ? normalizeRevision(item?.revision) : UNAVAILABLE_REVISION;
    if (revision !== null) {
      revisions.set(key, revision);
    }
  }

  return revisions;
}

function normalizeRevision(value) {
  const revision = String(value ?? "").trim();
  return revision || null;
}

function pruneRevisions(revisions, datasetNames) {
  const currentKeys = new Set(datasetNames.map(normalizeDatasetKey));
  for (const key of revisions.keys()) {
    if (!currentKeys.has(key)) {
      revisions.delete(key);
    }
  }
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];
  const names = [];
  const seen = new Set();

  for (const value of values) {
    const datasetName = String(value ?? "").trim();
    const key = normalizeDatasetKey(datasetName);
    if (!datasetName || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(datasetName);
  }

  return names;
}

function normalizeDatasetKey(datasetName) {
  return String(datasetName ?? "")
    .trim()
    .toUpperCase();
}

function isDocumentHidden(documentRef) {
  return documentRef?.visibilityState === "hidden" || documentRef?.hidden === true;
}
