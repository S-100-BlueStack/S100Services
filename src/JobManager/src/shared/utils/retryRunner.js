export async function runWithRetry(taskFn, options = {}) {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 60000,
    backoffFactor = 2,
    onRetry = () => {},
    signal = null,
  } = options;

  let attempt = 0;

  while (attempt < maxRetries) {
    throwIfAborted(signal);

    try {
      return await taskFn();
    } catch (error) {
      attempt += 1;

      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);

      onRetry({
        attempt,
        delay,
        error,
      });

      await waitForDelay(delay, signal);
    }
  }

  throw new Error("Retry runner exited without a result.");
}

function waitForDelay(delayMs, signal) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, delayMs);

    const handleAbort = () => {
      window.clearTimeout(timeoutId);
      reject(new Error("Operation aborted"));
    };

    if (signal) {
      signal.addEventListener("abort", handleAbort, {
        once: true,
      });
    }
  });
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new Error("Operation aborted");
  }
}
