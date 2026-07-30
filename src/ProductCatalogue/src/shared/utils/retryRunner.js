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
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    try {
      return await taskFn();
    } catch (error) {
      attempt++;

      if (attempt >= maxRetries) {
        throw error;
      }

      const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);

      onRetry({ attempt, delay, error });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, delay);

        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new Error("Operation aborted"));
          });
        }
      });
    }
  }
}
