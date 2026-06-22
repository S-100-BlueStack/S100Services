import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import { createJobPopupActions, createJobPopupContextContent } from "../popups/jobPopupActions.js";
import { createJobLayerFields, JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";
import { createJobPointRenderer, createJobPolygonRenderer } from "./jobRenderer.js";

export function createJobLayers() {
  const polygonLayer = new FeatureLayer({
    id: "job-manager-job-polygon-layer",
    title: "Job polygons",
    source: [],
    fields: createJobLayerFields(),
    objectIdField: JOB_LAYER_FIELD.OBJECT_ID,
    geometryType: "polygon",
    spatialReference: {
      wkid: 4326,
    },
    outFields: ["*"],
    popupEnabled: true,
    popupTemplate: createJobPopupTemplate(),
    renderer: createJobPolygonRenderer(),
  });

  const pointLayer = new FeatureLayer({
    id: "job-manager-job-point-layer",
    title: "Job points",
    source: [],
    fields: createJobLayerFields(),
    objectIdField: JOB_LAYER_FIELD.OBJECT_ID,
    geometryType: "point",
    spatialReference: {
      wkid: 4326,
    },
    outFields: ["*"],
    popupEnabled: true,
    popupTemplate: createJobPopupTemplate(),
    renderer: createJobPointRenderer(),
  });

  return {
    polygonLayer,
    pointLayer,
    layers: [polygonLayer, pointLayer],
  };
}

function createJobPopupTemplate() {
  return {
    title: `{${JOB_LAYER_FIELD.TITLE}}`,
    outFields: ["*"],
    content: [
      {
        type: "fields",
        fieldInfos: [
          {
            fieldName: JOB_LAYER_FIELD.STATUS_LABEL,
            label: "Status",
          },
          {
            fieldName: JOB_LAYER_FIELD.PRIORITY_LABEL,
            label: "Priority",
          },
          {
            fieldName: JOB_LAYER_FIELD.CREATED_AT,
            label: "Created",
          },
          {
            fieldName: JOB_LAYER_FIELD.DEADLINE,
            label: "Deadline",
          },
          {
            fieldName: JOB_LAYER_FIELD.RELATED_AOI_COUNT,
            label: "Affected AOIs",
          },
          {
            fieldName: JOB_LAYER_FIELD.SUMMARY,
            label: "Summary",
          },
        ],
      },
      createJobPopupContextContent(),
    ],
    actions: createJobPopupActions(),
  };
}
