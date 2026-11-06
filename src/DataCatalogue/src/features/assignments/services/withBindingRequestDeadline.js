export class BindingRequestTimeoutError extends Error {
  constructor(stage, timeoutMs) {
    super(`${stage} timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`);
    this.name = "BindingRequestTimeoutError";
    this.stage = stage;
  }
}

export function withBindingRequestDeadline(operation, { stage, timeoutMs, signal } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error("Binding request deadline must be a positive integer in milliseconds.");
  }

  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = (settle, value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settle(value);
    };
    const onAbort = () => {
      finish(reject, signal.reason ?? new DOMException("Request cancelled", "AbortError"));
      controller.abort(signal.reason);
    };
    const timer = setTimeout(() => {
      // A client abort limits our waiting; it does not prove the server rolled back a write.
      finish(reject, new BindingRequestTimeoutError(stage, timeoutMs));
      controller.abort();
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    Promise.resolve()
      .then(() => operation({ signal: controller.signal }))
      .then(
        (value) => finish(resolve, value),
        (error) => finish(reject, error)
      );
  });
}
