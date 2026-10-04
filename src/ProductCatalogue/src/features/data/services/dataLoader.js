import { dataLayerSources } from "../config/dataLayerSources.js";
import { loadCapabilities } from "../stores/capabilityStore.js";
import { loadStatuses } from "../stores/statusStore.js";
import { loadUsages } from "../stores/usageStore.js";

export async function loadAppData() {
  await Promise.all([loadStatuses(), loadUsages(), loadCapabilities()]);

  const layers = await Promise.all(
    dataLayerSources.map(async (source) => {
      const { fetch, ...layerConfig } = source;
      const data = await fetch();

      return {
        ...layerConfig,
        data,
      };
    })
  );
  return { layers };
}
