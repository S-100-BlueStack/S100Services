export function reconcileGraphicsLayers({ currentLayers, candidateLayers }) {
  const preparation = prepareReconciliation(currentLayers, candidateLayers);

  if (!preparation.success) {
    return preparation;
  }

  const changedFeatureKeys = new Set();
  let addedGraphicsCount = 0;
  let removedGraphicsCount = 0;
  let updatedGraphicsCount = 0;

  for (const plan of preparation.plans) {
    detachCandidateGraphics(plan.candidateLayer, plan.candidateGraphics);

    removeGraphics(plan.currentLayer, plan.graphicsToRemove);
    addGraphics(plan.currentLayer, plan.graphicsToAdd);

    for (const update of plan.graphicsToUpdate) {
      if (!copyGraphicState(update.currentGraphic, update.candidateGraphic)) {
        continue;
      }

      updatedGraphicsCount += 1;
      changedFeatureKeys.add(update.featureKey);
    }

    for (const graphic of plan.graphicsToAdd) {
      changedFeatureKeys.add(readFeatureKey(graphic));
    }

    for (const graphic of plan.graphicsToRemove) {
      changedFeatureKeys.add(readFeatureKey(graphic));
    }

    plan.currentLayer._index = plan.nextIndex;
    addedGraphicsCount += plan.graphicsToAdd.length;
    removedGraphicsCount += plan.graphicsToRemove.length;
  }

  return {
    success: true,
    strategy: "reconciled",
    layers: preparation.plans.map((plan) => plan.currentLayer),
    changedFeatureKeys,
    addedGraphicsCount,
    removedGraphicsCount,
    updatedGraphicsCount,
  };
}

function prepareReconciliation(currentLayers, candidateLayers) {
  const normalizedCurrentLayers = normalizeLayers(currentLayers);
  const normalizedCandidateLayers = normalizeLayers(candidateLayers);

  if (normalizedCurrentLayers.length === 0) {
    return createFailure("no-current-layers");
  }

  if (normalizedCurrentLayers.length !== normalizedCandidateLayers.length) {
    return createFailure("layer-count-changed");
  }

  const candidateLayersById = new Map();

  for (const candidateLayer of normalizedCandidateLayers) {
    const layerId = readLayerId(candidateLayer);

    if (!layerId || candidateLayersById.has(layerId)) {
      return createFailure("candidate-layer-identity-invalid");
    }

    candidateLayersById.set(layerId, candidateLayer);
  }

  const plans = [];

  for (const currentLayer of normalizedCurrentLayers) {
    const layerId = readLayerId(currentLayer);
    const candidateLayer = candidateLayersById.get(layerId);

    if (!candidateLayer) {
      return createFailure("layer-set-changed");
    }

    if (!areLayersCompatible(currentLayer, candidateLayer)) {
      return createFailure("layer-metadata-changed");
    }

    const plan = prepareLayerPlan(currentLayer, candidateLayer);

    if (!plan.success) {
      return plan;
    }

    plans.push(plan);
  }

  return {
    success: true,
    plans,
  };
}

function prepareLayerPlan(currentLayer, candidateLayer) {
  const currentGraphics = getGraphics(currentLayer);
  const candidateGraphics = getGraphics(candidateLayer);
  const currentIndex = currentLayer?._index;

  if (!(currentIndex instanceof Map) || currentIndex.size !== currentGraphics.length) {
    return createFailure("current-layer-index-invalid");
  }

  for (const graphic of currentGraphics) {
    const featureKey = readFeatureKey(graphic);

    if (!featureKey || currentIndex.get(featureKey) !== graphic) {
      return createFailure("current-feature-identity-invalid");
    }
  }

  const candidateIndex = new Map();

  for (const graphic of candidateGraphics) {
    const featureKey = readFeatureKey(graphic);

    if (!featureKey || candidateIndex.has(featureKey)) {
      return createFailure("candidate-feature-identity-invalid");
    }

    candidateIndex.set(featureKey, graphic);
  }

  const nextIndex = new Map();
  const graphicsToAdd = [];
  const graphicsToUpdate = [];

  for (const candidateGraphic of candidateGraphics) {
    const featureKey = readFeatureKey(candidateGraphic);
    const currentGraphic = currentIndex.get(featureKey);

    if (currentGraphic) {
      nextIndex.set(featureKey, currentGraphic);
      graphicsToUpdate.push({
        featureKey,
        currentGraphic,
        candidateGraphic,
      });
      continue;
    }

    nextIndex.set(featureKey, candidateGraphic);
    graphicsToAdd.push(candidateGraphic);
  }

  const graphicsToRemove = currentGraphics.filter((graphic) => {
    return !candidateIndex.has(readFeatureKey(graphic));
  });

  return {
    success: true,
    currentLayer,
    candidateLayer,
    candidateGraphics,
    nextIndex,
    graphicsToAdd,
    graphicsToRemove,
    graphicsToUpdate,
  };
}

function areLayersCompatible(currentLayer, candidateLayer) {
  return (
    readLayerId(currentLayer) === readLayerId(candidateLayer) &&
    currentLayer?.layerType === "graphics" &&
    candidateLayer?.layerType === "graphics" &&
    currentLayer?.appLayerId === candidateLayer?.appLayerId &&
    currentLayer?.appLayerKind === candidateLayer?.appLayerKind &&
    currentLayer?.title === candidateLayer?.title &&
    areEquivalent(currentLayer?.appLayerCapabilities, candidateLayer?.appLayerCapabilities)
  );
}

function copyGraphicState(currentGraphic, candidateGraphic) {
  const attributesChanged = !areEquivalent(currentGraphic?.attributes, candidateGraphic?.attributes);
  const geometryChanged = !areEquivalent(currentGraphic?.geometry, candidateGraphic?.geometry);
  const symbolChanged = !areEquivalent(currentGraphic?.symbol, candidateGraphic?.symbol);

  if (!attributesChanged && !geometryChanged && !symbolChanged) {
    return false;
  }

  if (attributesChanged) {
    currentGraphic.attributes = {
      ...(candidateGraphic.attributes ?? {}),
    };
  }

  if (geometryChanged) {
    currentGraphic.geometry = candidateGraphic.geometry;
  }

  if (symbolChanged) {
    currentGraphic.symbol = candidateGraphic.symbol;
  }

  return true;
}

function detachCandidateGraphics(candidateLayer, candidateGraphics) {
  if (typeof candidateLayer?.removeAll === "function") {
    candidateLayer.removeAll();
    return;
  }

  if (typeof candidateLayer?.removeMany === "function") {
    candidateLayer.removeMany(candidateGraphics);
  }
}

function removeGraphics(layer, graphics) {
  if (graphics.length === 0) {
    return;
  }

  if (typeof layer?.removeMany === "function") {
    layer.removeMany(graphics);
    return;
  }

  for (const graphic of graphics) {
    layer?.remove?.(graphic);
  }
}

function addGraphics(layer, graphics) {
  if (graphics.length === 0) {
    return;
  }

  if (typeof layer?.addMany === "function") {
    layer.addMany(graphics);
    return;
  }

  for (const graphic of graphics) {
    layer?.add?.(graphic);
  }
}

function getGraphics(layer) {
  if (Array.isArray(layer?.graphics)) {
    return [...layer.graphics];
  }

  return layer?.graphics?.toArray?.() ?? [];
}

function readLayerId(layer) {
  return String(layer?.customId ?? "").trim();
}

function readFeatureKey(graphic) {
  return String(graphic?.attributes?.featureKey ?? "").trim();
}

function normalizeLayers(layers) {
  return Array.isArray(layers) ? layers.filter(Boolean) : [];
}

function areEquivalent(left, right) {
  try {
    return stableSerialize(left) === stableSerialize(right);
  } catch {
    return false;
  }
}

function stableSerialize(value) {
  return JSON.stringify(normalizeComparableValue(value));
}

function normalizeComparableValue(value) {
  if (value && typeof value.toJSON === "function") {
    return normalizeComparableValue(value.toJSON());
  }

  if (Array.isArray(value)) {
    return value.map(normalizeComparableValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, normalizeComparableValue(value[key])])
  );
}

function createFailure(reason) {
  return {
    success: false,
    strategy: "rebuild-required",
    reason,
  };
}
