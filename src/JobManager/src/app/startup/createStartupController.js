import { runWithRetry as defaultRunWithRetry } from "../../shared/utils/retryRunner.js";

export const STARTUP_MAX_ATTEMPTS = 10;

export function createStartupController({
  startupLoader,
  mapController,
  jobStore,
  runWithRetry = defaultRunWithRetry,
  waitForNextPaint = defaultWaitForNextPaint,
  maxAttempts = STARTUP_MAX_ATTEMPTS,
} = {}) {
  let startupRequestId = 0;
  let isDestroyed = false;
  const abortController = new AbortController();
  const startupState = createStartupState();

  async function runStartup({ onStartupBlocked, onStartupComplete } = {}) {
    const currentStartupRequestId = startupRequestId + 1;
    startupRequestId = currentStartupRequestId;

    onStartupBlocked?.();
    startupLoader.startLoading(createStartupLoadingText(startupState));

    try {
      await runStartupStage({
        label: "map workspace",
        startupRequestId: currentStartupRequestId,
        task: () => ensureStartupMapReady({ startupRequestId: currentStartupRequestId }),
      });

      await runStartupStage({
        label: "Jobs load",
        startupRequestId: currentStartupRequestId,
        task: () => ensureStartupJobsReady({ startupRequestId: currentStartupRequestId }),
      });

      await runStartupStage({
        label: "Job map rendering",
        startupRequestId: currentStartupRequestId,
        task: () => ensureStartupJobMapReady({ startupRequestId: currentStartupRequestId }),
      });

      throwIfStaleStartup(currentStartupRequestId);

      onStartupComplete?.();
      startupLoader.complete({
        text: "Job Manager ready.",
      });

      return {
        ok: true,
        data: getStartupSnapshot(),
      };
    } catch (error) {
      if (isDestroyed || abortController.signal.aborted) {
        return {
          ok: false,
          aborted: true,
          error,
        };
      }

      startupLoader.fail({
        text: "Job Manager could not be loaded.",
        message: error?.message || "Required startup data could not be loaded.",
        onRetry() {
          void runStartup({ onStartupBlocked, onStartupComplete });
        },
      });

      return {
        ok: false,
        error,
      };
    }
  }

  async function runStartupStage({ label, startupRequestId: expectedStartupRequestId, task }) {
    throwIfStaleStartup(expectedStartupRequestId);

    return runWithRetry(task, {
      label,
      maxRetries: maxAttempts,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      signal: abortController.signal,
      onRetry({ attempt, delay, error }) {
        startupLoader.startRetryCountdown({
          attempt,
          totalAttempts: maxAttempts,
          delayMs: delay,
          error,
          label,
        });
      },
    });
  }

  async function ensureStartupMapReady({ startupRequestId: expectedStartupRequestId }) {
    throwIfStaleStartup(expectedStartupRequestId);

    if (startupState.mapReady) {
      startupLoader.markDataReceived({
        text: "Map workspace already loaded.",
        progress: 0.32,
      });

      return startupState.mapResult;
    }

    startupLoader.setText("Preparing map workspace...");
    startupLoader.setDetail("The map and AOI source are loading.");
    startupLoader.setProgress(0.1);

    const mapStartupResult = await mapController.start({
      requireAois: true,
      deferJobGeometry: true,
      suppressStatus: true,
    });

    throwIfStaleStartup(expectedStartupRequestId);

    if (!mapStartupResult.ok) {
      throw mapStartupResult.error || new Error("Map startup failed.");
    }

    startupState.mapReady = true;
    startupState.mapResult = mapStartupResult.data;

    startupLoader.markDataReceived({
      text: "Map workspace loaded.",
      progress: 0.32,
    });

    return startupState.mapResult;
  }

  async function ensureStartupJobsReady({ startupRequestId: expectedStartupRequestId }) {
    throwIfStaleStartup(expectedStartupRequestId);

    if (startupState.jobsReady) {
      startupLoader.markDataReceived({
        text: "Jobs already loaded.",
        progress: 0.58,
      });

      return startupState.jobs;
    }

    startupLoader.setText("Loading Jobs...");
    startupLoader.setDetail("The required Jobs list is loading from the mock backend.");
    startupLoader.setProgress(0.42);

    const jobsResult = await jobStore.loadJobs();

    throwIfStaleStartup(expectedStartupRequestId);

    if (!jobsResult.ok) {
      throw jobsResult.error;
    }

    const jobs = normalizeStartupJobs(jobsResult.data?.jobs);

    startupState.jobsReady = true;
    startupState.jobs = jobs;
    startupState.jobMapReady = false;

    startupLoader.markDataReceived({
      text: "Jobs loaded.",
      progress: 0.58,
    });

    return startupState.jobs;
  }

  async function ensureStartupJobMapReady({ startupRequestId: expectedStartupRequestId }) {
    throwIfStaleStartup(expectedStartupRequestId);

    if (startupState.jobMapReady) {
      startupLoader.setText("Job map layers already rendered.");
      startupLoader.setDetail("");
      startupLoader.setProgress(0.94);

      return {
        jobs: startupState.jobs,
        map: startupState.mapResult,
      };
    }

    startupLoader.startRendering({
      text: "Rendering Jobs on the map...",
      progress: 0.68,
    });

    const jobMapResult = await mapController.refreshJobData({
      jobs: startupState.jobs,
    });

    throwIfStaleStartup(expectedStartupRequestId);

    if (!jobMapResult.ok) {
      throw jobMapResult.error || new Error("Job map layers could not be loaded.");
    }

    startupState.jobMapReady = true;

    startupLoader.setText("Finalizing map workspace...");
    startupLoader.setDetail("");
    startupLoader.setProgress(0.94);

    await waitForNextPaint();

    return {
      jobs: startupState.jobs,
      map: startupState.mapResult,
    };
  }

  function throwIfStaleStartup(expectedStartupRequestId) {
    if (isDestroyed || abortController.signal.aborted) {
      throw new Error("Operation aborted");
    }

    if (expectedStartupRequestId !== startupRequestId) {
      throw new Error("Startup attempt was replaced.");
    }
  }

  function getStartupSnapshot() {
    return {
      mapReady: startupState.mapReady,
      mapResult: startupState.mapResult,
      jobsReady: startupState.jobsReady,
      jobs: [...startupState.jobs],
      jobMapReady: startupState.jobMapReady,
    };
  }

  function destroy() {
    isDestroyed = true;
    startupRequestId += 1;
    abortController.abort();
  }

  return {
    runStartup,
    destroy,
    getSnapshot: getStartupSnapshot,
  };
}

function normalizeStartupJobs(jobs) {
  if (!Array.isArray(jobs)) {
    throw new Error("Jobs loader returned an invalid result.");
  }

  return jobs;
}

function createStartupState() {
  return {
    mapReady: false,
    mapResult: null,
    jobsReady: false,
    jobs: [],
    jobMapReady: false,
  };
}

function createStartupLoadingText(startupState) {
  if (!startupState.mapReady) {
    return "Preparing map workspace...";
  }

  if (!startupState.jobsReady) {
    return "Loading Jobs...";
  }

  if (!startupState.jobMapReady) {
    return "Rendering Jobs on the map...";
  }

  return "Starting Job Manager...";
}

function defaultWaitForNextPaint() {
  if (typeof requestAnimationFrame !== "function") {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}
