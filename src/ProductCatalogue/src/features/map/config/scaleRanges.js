const DEFAULT_DETAIL_MIN_SCALE = 1_000_000;

export function resolveScaleRanges(layerConfig) {
  const detailMinScale =
    layerConfig.detailMinScale ??
    layerConfig.scaleRange?.detailMinScale ??
    layerConfig.scaleRanges?.detail?.minScale ??
    DEFAULT_DETAIL_MIN_SCALE;

  return {
    overview: {
      minScale: layerConfig.scaleRanges?.overview?.minScale ?? 0,
      maxScale: layerConfig.scaleRanges?.overview?.maxScale ?? detailMinScale,
    },

    detail: {
      minScale: layerConfig.scaleRanges?.detail?.minScale ?? detailMinScale,
      maxScale: layerConfig.scaleRanges?.detail?.maxScale ?? 0,
    },
  };
}
