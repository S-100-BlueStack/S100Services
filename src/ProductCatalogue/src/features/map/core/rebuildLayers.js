import { clearLayers, registerLayer } from "./layerRegistry.js";

export async function rebuildLayers({ map, hoverManager, layerConfigs, createLayer, onProgress }) {
  hoverManager.clear();
  clearLayers(map);

  const createdLayers = [];
  const layerViewPromises = [];
  const layerCount = layerConfigs.length;

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const layerConfig = layerConfigs[layerIndex];

    const layer = await createLayer(map, layerConfig, {
      onProgress: ({ progress = 0, stage, layerTitle } = {}) => {
        const layerProgress = clamp(progress, 0, 1);
        const totalProgress = (layerIndex + layerProgress) / layerCount;

        onProgress?.({
          progress: totalProgress,
          stage,
          layerIndex,
          layerCount,
          layerTitle: layerTitle ?? layerConfig.title ?? layerConfig.id,
        });
      },
    });

    if (!layer) {
      continue;
    }

    registerLayer(layer);
    createdLayers.push(layer);
    layerViewPromises.push(hoverManager.registerLayer(layer));

    onProgress?.({
      progress: (layerIndex + 1) / layerCount,
      stage: "Registered layer",
      layerIndex,
      layerCount,
      layerTitle: layerConfig.title ?? layerConfig.id,
    });
  }

  await Promise.all(layerViewPromises);

  onProgress?.({
    progress: 1,
    stage: "Finalizing map",
    layerIndex: layerCount,
    layerCount,
  });

  return createdLayers;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
