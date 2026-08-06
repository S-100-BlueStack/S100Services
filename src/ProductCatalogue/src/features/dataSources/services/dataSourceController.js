import {
  getDataSourceDefinition,
  getDefaultEnabledSourceIds,
  getRuntimeSelectableDataSources,
  isRuntimeSelectableDataSource,
} from "../config/dataSourceRegistry.js";

export function createDataSourceController({
  registry,
  persistence,
  loadSource,
  normalizeSource,
  mapAdapter,
  lifecycle,
  noticeError = () => {},
  onLayersChanged = () => {},
} = {}) {
  const sourceStates = new Map(
    registry.definitions.map((source) => [source.id, createInitialState(source.id)])
  );
  const operationContexts = new Map();
  const listeners = new Set();
  let initialized = false;
  let initializationPromise = null;
  let destroyed = false;

  function initialize() {
    assertNotDestroyed();
    if (initialized) {
      return Promise.resolve(createSummary("already-initialized", []));
    }
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = initializeController().finally(() => {
      if (!initialized) {
        initializationPromise = null;
      }
    });
    return initializationPromise;
  }

  async function initializeController() {
    const persistedSelection = persistence.read(registry);
    const targetIds = new Set(persistedSelection.enabledSourceIds);
    const results = await Promise.all(
      getRuntimeSelectableDataSources(registry).map((source) => {
        if (!targetIds.has(source.id)) {
          return Promise.resolve({ sourceId: source.id, success: true, skipped: true });
        }

        return activateSource(source.id, {
          persist: false,
          reason: "initialization",
          silent: false,
        });
      })
    );

    initialized = true;

    // Persist the selected intent rather than only successful activations. A
    // temporary loader failure must not silently convert first-visit defaults
    // or an existing valid selection into an explicit all-off choice.
    persistence.write(registry, persistedSelection.enabledSourceIds);
    emitStateChanged({ type: "initialized", persistedSelection });
    return createSummary("initialized", results);
  }

  async function setSourceEnabled(sourceId, enabled, options = {}) {
    return enabled ? activateSource(sourceId, options) : deactivateSource(sourceId, options);
  }

  async function activateSource(
    sourceId,
    { persist = true, reason = "user-activation", silent = false } = {}
  ) {
    assertNotDestroyed();
    const source = requireRuntimeSource(sourceId);
    const state = sourceStates.get(source.id);
    const operation = beginOperation(source.id);
    const wasEnabled = state.enabled;

    updateState(source.id, {
      requestedEnabled: true,
      loading: true,
      error: null,
      generation: operation.generation,
    });

    let candidate = null;
    try {
      const rawPayload = await loadSource(source, { signal: operation.abortController.signal });
      if (!isCurrentOperation(source.id, operation.generation, true)) {
        return createStaleResult(source.id, operation.generation);
      }

      const normalized = await normalizeSource(rawPayload, source);
      if (!isCurrentOperation(source.id, operation.generation, true)) {
        return createStaleResult(source.id, operation.generation);
      }

      candidate = await mapAdapter.prepareSource({
        source,
        normalized,
        generation: operation.generation,
      });

      if (!isCurrentOperation(source.id, operation.generation, true)) {
        mapAdapter.discardCandidate(candidate);
        candidate = null;
        return createStaleResult(source.id, operation.generation);
      }

      const commitResult = mapAdapter.commitSource(candidate, {
        isCurrent: () => isCurrentOperation(source.id, operation.generation, true),
      });

      if (!commitResult.committed) {
        mapAdapter.discardCandidate(candidate);
        candidate = null;
        return createStaleResult(source.id, operation.generation);
      }

      candidate = null;
      updateState(source.id, {
        requestedEnabled: true,
        enabled: true,
        loading: false,
        error: null,
        loadedAt: new Date().toISOString(),
        generation: operation.generation,
      });
      onLayersChanged({ sourceId: source.id, type: wasEnabled ? "refreshed" : "activated" });
      lifecycle?.emit?.(wasEnabled ? "refreshed" : "activated", {
        sourceId: source.id,
        source,
        reason,
        generation: operation.generation,
        layers: commitResult.layers,
      });
      if (persist) {
        persistCurrentState();
      }

      void commitResult.hoverReady;
      return {
        sourceId: source.id,
        success: true,
        stale: false,
        generation: operation.generation,
        refreshed: wasEnabled,
      };
    } catch (error) {
      if (candidate) {
        mapAdapter.discardCandidate(candidate);
      }

      if (!isCurrentOperation(source.id, operation.generation, true)) {
        return createStaleResult(source.id, operation.generation);
      }

      if (!wasEnabled) {
        lifecycle?.emit?.("deactivating", {
          sourceId: source.id,
          source,
          reason: "activation-failed",
        });
        mapAdapter.removeSource(source.id);
      }

      updateState(source.id, {
        requestedEnabled: wasEnabled,
        enabled: wasEnabled,
        loading: false,
        error: normalizeErrorMessage(error),
        generation: operation.generation,
      });

      if (persist) {
        persistCurrentState();
      }

      if (!silent) {
        noticeError(
          wasEnabled ? `${source.label} refresh failed` : `${source.label} could not be enabled`,
          normalizeErrorMessage(error),
          {
            source: "data-sources",
            dedupeKey: `data-source:${source.id}:${wasEnabled ? "refresh" : "activation"}`,
          }
        );
      } else {
        console.warn(`[Data sources] ${source.label} refresh failed.`, error);
      }

      return {
        sourceId: source.id,
        success: false,
        stale: false,
        generation: operation.generation,
        error,
        retainedPreviousRepresentation: wasEnabled,
      };
    }
  }

  async function deactivateSource(sourceId, { persist = true, reason = "user-deactivation" } = {}) {
    assertNotDestroyed();
    const source = getDataSourceDefinition(registry, sourceId);
    if (!source) {
      return { sourceId, success: false, skipped: true, reason: "unknown-source" };
    }

    const operation = invalidateOperation(source.id);
    lifecycle?.emit?.("deactivating", {
      sourceId: source.id,
      source,
      reason,
      generation: operation.generation,
      layers: mapAdapter.getSourceLayers(source.id),
    });
    mapAdapter.removeSource(source.id);
    updateState(source.id, {
      requestedEnabled: false,
      enabled: false,
      loading: false,
      error: null,
      loadedAt: null,
      generation: operation.generation,
    });
    lifecycle?.emit?.("deactivated", {
      sourceId: source.id,
      source,
      reason,
      generation: operation.generation,
    });
    onLayersChanged({ sourceId: source.id, type: "deactivated" });

    if (persist) {
      persistCurrentState();
    }

    return {
      sourceId: source.id,
      success: true,
      stale: false,
      generation: operation.generation,
    };
  }

  async function refreshActive({ reason = "manual-refresh", silent = false } = {}) {
    assertNotDestroyed();
    const activeSourceIds = getActiveSourceIds();
    const results = await Promise.all(
      activeSourceIds.map((sourceId) =>
        activateSource(sourceId, {
          persist: false,
          reason,
          silent,
        })
      )
    );
    persistCurrentState();

    return createSummary("refresh", results);
  }

  async function resetToDefaults({ reason = "local-reset", silent = false } = {}) {
    assertNotDestroyed();
    const defaultIds = new Set(getDefaultEnabledSourceIds(registry));
    const selectableSources = getRuntimeSelectableDataSources(registry);

    // Invalidate every source before any asynchronous default activation starts.
    // This is the transaction boundary that prevents old activation or refresh
    // work from publishing after either local or global reset.
    for (const source of registry.definitions) {
      await deactivateSource(source.id, {
        persist: false,
        reason,
      });
    }

    const results = await Promise.all(
      selectableSources
        .filter((source) => defaultIds.has(source.id))
        .map((source) =>
          activateSource(source.id, {
            persist: false,
            reason,
            silent,
          })
        )
    );

    // Reset records the deployment defaults as selection intent even when a
    // loader is temporarily unavailable. With zero selectable sources the
    // persistence boundary intentionally performs no write.
    persistence.write(registry, [...defaultIds]);
    emitStateChanged({ type: "reset", reason });
    return createSummary("reset", results);
  }

  function getState(sourceId) {
    const state = sourceStates.get(sourceId);
    return state ? { ...state } : null;
  }

  function getStates() {
    return registry.definitions.map((source) => ({
      source,
      state: getState(source.id),
    }));
  }

  function getActiveSourceIds() {
    return registry.definitions
      .filter((source) => sourceStates.get(source.id)?.enabled)
      .map((source) => source.id);
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy({ removeLayers = true } = {}) {
    if (destroyed) {
      return;
    }

    destroyed = true;
    for (const context of operationContexts.values()) {
      context.abortController.abort();
    }
    operationContexts.clear();

    if (removeLayers) {
      for (const source of registry.definitions) {
        mapAdapter.removeSource(source.id);
      }
    }

    listeners.clear();
  }

  function beginOperation(sourceId) {
    const previousContext = operationContexts.get(sourceId);
    previousContext?.abortController.abort();
    const previousGeneration = sourceStates.get(sourceId)?.generation ?? 0;
    const context = {
      generation: previousGeneration + 1,
      abortController: new AbortController(),
    };
    operationContexts.set(sourceId, context);
    return context;
  }

  function invalidateOperation(sourceId) {
    const context = beginOperation(sourceId);
    context.abortController.abort();
    return context;
  }

  function isCurrentOperation(sourceId, generation, requestedEnabled) {
    const state = sourceStates.get(sourceId);
    return Boolean(
      !destroyed && state?.generation === generation && state.requestedEnabled === requestedEnabled
    );
  }

  function updateState(sourceId, patch) {
    const currentState = sourceStates.get(sourceId) ?? createInitialState(sourceId);
    sourceStates.set(sourceId, {
      ...currentState,
      ...patch,
    });
    emitStateChanged({ type: "state-changed", sourceId });
  }

  function emitStateChanged(detail) {
    const snapshot = getStates();
    for (const listener of listeners) {
      listener(snapshot, detail);
    }
  }

  function persistCurrentState() {
    persistence.write(registry, getActiveSourceIds());
  }

  function requireRuntimeSource(sourceId) {
    const source = getDataSourceDefinition(registry, sourceId);
    if (!source) {
      throw new Error(`Unknown data source: ${sourceId}.`);
    }
    if (!isRuntimeSelectableDataSource(source)) {
      throw new Error(`Data source "${source.label}" is not available in this deployment.`);
    }

    return source;
  }

  function assertNotDestroyed() {
    if (destroyed) {
      throw new Error("The data source controller has been destroyed.");
    }
  }

  return {
    initialize,
    setSourceEnabled,
    activateSource,
    deactivateSource,
    refreshActive,
    resetToDefaults,
    getState,
    getStates,
    getActiveSourceIds,
    subscribe,
    destroy,
  };
}

function createInitialState(sourceId) {
  return {
    sourceId,
    requestedEnabled: false,
    enabled: false,
    loading: false,
    error: null,
    generation: 0,
    loadedAt: null,
  };
}

function createStaleResult(sourceId, generation) {
  return {
    sourceId,
    success: false,
    stale: true,
    skipped: true,
    generation,
    reason: "superseded",
  };
}

function createSummary(type, results) {
  const normalizedResults = Array.isArray(results) ? results : [];
  return {
    type,
    results: normalizedResults,
    success: normalizedResults.every((result) => result.success || result.skipped || result.stale),
    failedSourceIds: normalizedResults
      .filter((result) => !result.success && !result.skipped && !result.stale)
      .map((result) => result.sourceId),
  };
}

function normalizeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown data source error.");
}
