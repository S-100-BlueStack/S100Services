import { fetchWorkspaceFreshness } from "../api/workspaceFreshnessApi.js";

export const DEFAULT_WORKSPACE_FRESHNESS_INTERVAL_MS = 30_000;

const UNAVAILABLE_REVISION = "__workspace_unavailable__";

export function createWorkspaceFreshnessMonitor({
  getDatasetNames,
  getRetainedDatasetNames = getDatasetNames,
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
  let inFlightPrime = null;
  const additionalPrimes = new Map();
  const additionalRecoveryKeys = new Set();
  let lifecycleGeneration = 0;
  let compositionEpoch = 0;
  let recoveryRefreshRequired = false;
  let started = false;
  let disposed = false;

  const prime = (datasetNames = getDatasetNames()) => {
    const promise = runPrime(datasetNames);
    inFlightPrime = promise;
    return promise.finally(() => {
      if (inFlightPrime === promise) inFlightPrime = null;
    });
  };

  const runPrime = async (datasetNames) => {
    const generation = ++lifecycleGeneration;
    additionalPrimes.clear();
    additionalRecoveryKeys.clear();
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

  // Additions seed only their own revisions without resetting surviving baselines
  // or invalidating an unrelated changed-Product refresh.
  const primeAdditional = (datasetNames) => {
    if (disposed) return Promise.resolve(false);
    const names = normalizeDatasetNames(datasetNames);
    const missing = names.filter((name) => !additionalPrimes.has(normalizeDatasetKey(name)));
    if (missing.length > 0) {
      const generation = lifecycleGeneration;
      const promise = (async () => {
        await inFlightPrime;
        if (disposed || generation !== lifecycleGeneration) return false;
        try {
          const items = await fetchFreshness(missing);
          if (disposed || generation !== lifecycleGeneration) return false;
          const nextRevisions = createRevisionMap(items, missing);
          const retained = new Set(
            normalizeDatasetNames(getRetainedDatasetNames()).map(normalizeDatasetKey)
          );
          for (const name of missing) {
            const key = normalizeDatasetKey(name);
            if (!retained.has(key) || additionalPrimes.get(key) !== promise) continue;
            if (nextRevisions.has(key)) {
              revisions.set(key, nextRevisions.get(key));
              additionalRecoveryKeys.delete(key);
            } else {
              additionalRecoveryKeys.add(key);
            }
          }
          return true;
        } catch (error) {
          if (!disposed && generation === lifecycleGeneration) {
            for (const name of missing) {
              const key = normalizeDatasetKey(name);
              if (additionalPrimes.get(key) === promise) additionalRecoveryKeys.add(key);
            }
            console.warn("[Workspace freshness] Additional revision check failed", error);
          }
          return false;
        }
      })();
      for (const name of missing) additionalPrimes.set(normalizeDatasetKey(name), promise);
      void promise.finally(() => {
        for (const name of missing) {
          const key = normalizeDatasetKey(name);
          if (additionalPrimes.get(key) === promise) additionalPrimes.delete(key);
        }
      });
    }
    return Promise.all(names.map((name) => additionalPrimes.get(normalizeDatasetKey(name))));
  };

  const retain = () => {
    // Any authoritative composition/eligibility edit invalidates observations
    // captured before this retention boundary. Additional Product priming keeps
    // its existing per-record ownership and is intentionally not invalidated.
    compositionEpoch += 1;
    const names = normalizeDatasetNames(getRetainedDatasetNames());
    const keys = new Set(names.map(normalizeDatasetKey));
    pruneRevisions(revisions, names);
    for (const key of additionalRecoveryKeys) {
      if (!keys.has(key)) additionalRecoveryKeys.delete(key);
    }
    for (const key of additionalPrimes.keys()) {
      if (!keys.has(key)) additionalPrimes.delete(key);
    }
  };

  const check = () => {
    if (disposed || isDocumentHidden(documentRef)) {
      return Promise.resolve(false);
    }
    if (inFlightPrime || additionalPrimes.size > 0) {
      return Promise.resolve(false);
    }
    if (inFlightCheck) {
      return inFlightCheck;
    }

    const names = normalizeDatasetNames(getDatasetNames());
    if (names.length === 0) {
      pruneRevisions(revisions, normalizeDatasetNames(getRetainedDatasetNames()));
      return Promise.resolve(true);
    }

    const generation = lifecycleGeneration;
    const observationEpoch = compositionEpoch;
    inFlightCheck = runCheck(names, generation, observationEpoch).finally(() => {
      inFlightCheck = null;
    });
    return inFlightCheck;
  };

  const runCheck = async (names, generation, observationEpoch) => {
    try {
      const items = await fetchFreshness(names);
      if (disposed || generation !== lifecycleGeneration || observationEpoch !== compositionEpoch) {
        return false;
      }

      const nextRevisions = createRevisionMap(items, names);
      const changedDatasetNames = recoveryRefreshRequired
        ? names.filter((datasetName) => nextRevisions.has(normalizeDatasetKey(datasetName)))
        : names.filter(
            (datasetName) =>
              additionalRecoveryKeys.has(normalizeDatasetKey(datasetName)) &&
              nextRevisions.has(normalizeDatasetKey(datasetName))
          );

      for (const datasetName of recoveryRefreshRequired ? [] : names) {
        const key = normalizeDatasetKey(datasetName);
        if (
          additionalPrimes.has(key) ||
          changedDatasetNames.includes(datasetName) ||
          !nextRevisions.has(key)
        ) {
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

      pruneRevisions(revisions, normalizeDatasetNames(getRetainedDatasetNames()));

      if (changedDatasetNames.length === 0) {
        recoveryRefreshRequired = false;
        return true;
      }

      const accepted = await onChanged(changedDatasetNames);
      if (
        disposed ||
        generation !== lifecycleGeneration ||
        observationEpoch !== compositionEpoch ||
        accepted === false
      ) {
        return false;
      }

      for (const name of changedDatasetNames) {
        additionalRecoveryKeys.delete(normalizeDatasetKey(name));
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
      if (
        !disposed &&
        generation === lifecycleGeneration &&
        observationEpoch === compositionEpoch
      ) {
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
    additionalPrimes.clear();
    additionalRecoveryKeys.clear();
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
    primeAdditional,
    retain,
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
