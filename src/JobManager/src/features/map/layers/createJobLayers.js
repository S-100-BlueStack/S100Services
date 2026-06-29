import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";

import { JOB_PRIORITY } from "../../jobs/domain/jobPriority.js";
import { createJobPopupActions, createJobPopupContextContent } from "../popups/jobPopupActions.js";
import { createCountJobPointFeatureReduction } from "./jobClustering.js";
import { createJobLayerFields, JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";
import {
  createJobPointRenderer,
  createJobPolygonRenderer,
  createJobPriorityPointRenderer,
} from "./jobRenderer.js";

export function createJobLayers() {
  const polygonLayer = createJobPolygonLayer();
  const pointLayer = createJobPointLayer({
    id: "job-manager-job-point-layer",
    title: "Job points",
    visible: true,
    renderer: createJobPointRenderer(),
  });
  const priorityPointLayers = createPriorityPointLayers();

  return {
    polygonLayer,
    pointLayer,
    priorityPointLayers,
    layers: [
      polygonLayer,
      pointLayer,
      priorityPointLayers[JOB_PRIORITY.LOW],
      priorityPointLayers[JOB_PRIORITY.MEDIUM],
      priorityPointLayers[JOB_PRIORITY.HIGH],
    ],
  };
}

function createJobPolygonLayer() {
  return new FeatureLayer({
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
}

function createPriorityPointLayers() {
  return {
    [JOB_PRIORITY.LOW]: createJobPointLayer({
      id: "job-manager-job-point-layer-low-priority",
      title: "Low priority Job points",
      visible: false,
      renderer: createJobPriorityPointRenderer(),
    }),
    [JOB_PRIORITY.MEDIUM]: createJobPointLayer({
      id: "job-manager-job-point-layer-medium-priority",
      title: "Medium priority Job points",
      visible: false,
      renderer: createJobPriorityPointRenderer(),
    }),
    [JOB_PRIORITY.HIGH]: createJobPointLayer({
      id: "job-manager-job-point-layer-high-priority",
      title: "High priority Job points",
      visible: false,
      renderer: createJobPriorityPointRenderer(),
    }),
  };
}

function createJobPointLayer({ id, title, visible, renderer }) {
  return new FeatureLayer({
    id,
    title,
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
    renderer,
    visible,
    featureReduction: createCountJobPointFeatureReduction(),
  });
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
