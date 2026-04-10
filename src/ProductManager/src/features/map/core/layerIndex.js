export function createLayerIndex(graphics) {
  const index = new Map();

  for (const graphic of graphics) {
    const featureKey = graphic.attributes?.featureKey;

    if (!featureKey) {
      console.warn("Graphic is missing featureKey and cannot be restored after refresh.", graphic);
      continue;
    }

    if (index.has(featureKey)) {
      console.warn(`Duplicate featureKey detected: ${featureKey}`);
    }

    index.set(featureKey, graphic);
  }

  return index;
}
