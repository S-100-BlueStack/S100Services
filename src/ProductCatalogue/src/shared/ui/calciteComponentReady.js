const DEFAULT_CALCITE_COMPONENT_TIMEOUT_MS = 10 * 1000;

export async function waitForCalciteComponents(componentNames, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CALCITE_COMPONENT_TIMEOUT_MS;
  const uniqueComponentNames = [...new Set(componentNames)].filter(Boolean);

  await Promise.all(
    uniqueComponentNames.map((componentName) => waitForCalciteComponent(componentName, timeoutMs))
  );
}

async function waitForCalciteComponent(componentName, timeoutMs) {
  if (!customElements?.whenDefined) {
    throw new Error("Custom elements are not supported in this browser.");
  }

  return runWithTimeout(
    customElements.whenDefined(componentName),
    timeoutMs,
    `Timed out while waiting for ${componentName} to be defined.`
  );
}

function runWithTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}
