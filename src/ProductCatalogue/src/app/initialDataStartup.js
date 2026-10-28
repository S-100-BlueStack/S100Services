export async function runInitialDataStartup({
  loadCompatibilityData,
  initializeRuntimeSources,
} = {}) {
  const compatibilityPromise = settleTask(loadCompatibilityData);
  const runtimeSourcesPromise = settleTask(initializeRuntimeSources);
  const [compatibility, runtimeSources] = await Promise.all([
    compatibilityPromise,
    runtimeSourcesPromise,
  ]);

  return {
    compatibility,
    runtimeSources,
  };
}

function settleTask(task) {
  if (typeof task !== "function") {
    return Promise.resolve({
      status: "fulfilled",
      value: undefined,
      skipped: true,
    });
  }

  return Promise.resolve()
    .then(task)
    .then(
      (value) => ({ status: "fulfilled", value, skipped: false }),
      (reason) => ({ status: "rejected", reason, skipped: false })
    );
}
