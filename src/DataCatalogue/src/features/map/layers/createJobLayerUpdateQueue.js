export function createJobLayerUpdateQueue({ writeSnapshot } = {}) {
  if (typeof writeSnapshot !== "function") {
    throw new TypeError("A Job layer writer is required.");
  }

  let generation = 0;
  let pending = null;
  let writing = false;
  let disposed = false;

  function request({ jobs } = {}) {
    if (disposed) {
      return Promise.resolve(supersededResult());
    }

    const requestGeneration = ++generation;

    return new Promise((resolve) => {
      // Keep only the latest desired snapshot while the current write finishes.
      pending?.resolve(supersededResult());
      pending = { jobs, generation: requestGeneration, resolve };
      void drain();
    });
  }

  async function drain() {
    if (writing) {
      return;
    }

    writing = true;

    try {
      while (pending && !disposed) {
        const current = pending;
        pending = null;
        const shouldApply = () => !disposed && current.generation === generation;

        try {
          const result = await writeSnapshot({ jobs: current.jobs, shouldApply });
          current.resolve(shouldApply() ? result : supersededResult());
        } catch (error) {
          current.resolve(shouldApply() ? { ok: false, error } : supersededResult());
        }
      }
    } finally {
      writing = false;
    }
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    generation += 1;
    pending?.resolve(supersededResult());
    pending = null;
  }

  return { request, dispose };
}

function supersededResult() {
  return {
    ok: true,
    data: { pointCount: 0, polygonCount: 0 },
    meta: { superseded: true },
  };
}
