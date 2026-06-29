import * as reactiveUtils from "@arcgis/core/core/reactiveUtils.js";

import { AOI_FIELD } from "../../aoi/config/aoiFieldConfig.js";

export function createAoiHighlightController({ view, aoiLayer } = {}) {
  let highlightHandle = null;
  let activeHighlightToken = 0;

  async function highlightAoisByIds(aoiIds = []) {
    activeHighlightToken += 1;
    const highlightToken = activeHighlightToken;

    clearHighlight();

    const normalizedAoiIds = normalizeAoiIds(aoiIds);

    if (!view || !aoiLayer || normalizedAoiIds.length === 0) {
      return;
    }

    await aoiLayer.load();

    if (highlightToken !== activeHighlightToken) {
      return;
    }

    const layerView = await view.whenLayerView(aoiLayer);

    await reactiveUtils.whenOnce(() => !layerView.updating);

    if (highlightToken !== activeHighlightToken) {
      return;
    }

    const features = await queryAoiFeaturesByGlobalIds(layerView, normalizedAoiIds);

    if (highlightToken !== activeHighlightToken || features.length === 0) {
      return;
    }

    highlightHandle = layerView.highlight(features);
  }

  function clearHighlight() {
    highlightHandle?.remove();
    highlightHandle = null;
  }

  function destroy() {
    activeHighlightToken += 1;
    clearHighlight();
  }

  return {
    highlightAoisByIds,
    clearHighlight,
    destroy,
  };
}

async function queryAoiFeaturesByGlobalIds(layerView, aoiIds) {
  const query = layerView.createQuery();

  query.where = createGlobalIdWhereClause(aoiIds);
  query.outFields = [AOI_FIELD.OBJECT_ID, AOI_FIELD.GLOBAL_ID];
  query.returnGeometry = true;

  const featureSet = await layerView.queryFeatures(query);

  return featureSet.features ?? [];
}

function createGlobalIdWhereClause(aoiIds) {
  const values = aoiIds.map((aoiId) => `'${escapeSqlString(aoiId)}'`).join(", ");

  return `${AOI_FIELD.GLOBAL_ID} IN (${values})`;
}

function normalizeAoiIds(aoiIds) {
  return [...new Set(normalizeArray(aoiIds).map(normalizeOptionalString).filter(Boolean))];
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function escapeSqlString(value) {
  return String(value).replaceAll("'", "''");
}
