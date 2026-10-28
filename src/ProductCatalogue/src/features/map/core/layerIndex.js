const DEFAULT_INDEX_CHUNK_SIZE = 1000;

export function createLayerIndex(graphics) {
  const index = new Map();

  for (const graphic of graphics) {
    addGraphicToIndex(index, graphic);
  }

  return index;
}

export async function createLayerIndexAsync(
  graphics,
  { chunkSize = DEFAULT_INDEX_CHUNK_SIZE, onProgress } = {}
) {
  const index = new Map();

  for (let start = 0; start < graphics.length; start += chunkSize) {
    const chunk = graphics.slice(start, start + chunkSize);

    for (const graphic of chunk) {
      addGraphicToIndex(index, graphic);
    }

    onProgress?.(Math.min(1, (start + chunk.length) / graphics.length));
    await yieldToBrowser();
  }

  return index;
}

function addGraphicToIndex(index, graphic) {
  const featureKey = graphic.attributes?.featureKey;

  if (!featureKey) {
    console.warn("Graphic is missing featureKey and cannot be restored after refresh.", graphic);
    return;
  }

  if (index.has(featureKey)) {
    console.warn(`Duplicate featureKey detected: ${featureKey}`);
  }

  index.set(featureKey, graphic);
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
