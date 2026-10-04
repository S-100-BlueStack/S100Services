export function createDataSourceLifecycle() {
  const listeners = new Map();

  function subscribe(eventName, listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    const eventListeners = listeners.get(eventName) ?? new Set();
    eventListeners.add(listener);
    listeners.set(eventName, eventListeners);

    return () => {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        listeners.delete(eventName);
      }
    };
  }

  function emit(eventName, detail) {
    for (const listener of listeners.get(eventName) ?? []) {
      try {
        listener(detail);
      } catch (error) {
        console.error(`[Data sources] Lifecycle listener failed for ${eventName}.`, error);
      }
    }
  }

  function clear() {
    listeners.clear();
  }

  return {
    subscribe,
    emit,
    clear,
  };
}
