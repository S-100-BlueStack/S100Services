import { createErrorResult, createSuccessResult } from "../../../shared/api/apiResult.js";
import { normalizeError } from "../../../shared/errors/normalizeError.js";
import { createAoiFeatureServiceConfig } from "../config/aoiConfig.js";
import { createAoiFieldValidationReport } from "../config/aoiFieldConfig.js";

export const AOI_LAYER_READINESS_STATUS = Object.freeze({
  MISSING_CONFIG: "missing-config",
  READY: "ready",
  WARNING: "warning",
});

export async function loadAois({ runtimeConfig } = {}) {
  const config = createAoiFeatureServiceConfig(runtimeConfig);

  // Keep a stable service facade while FeatureLayer remains the current AOI loading owner.
  return createSuccessResult(
    {
      aois: [],
      sourceType: config.sourceType,
      isConfigured: config.isConfigured,
      readinessStatus: config.isConfigured
        ? "feature-layer-owned"
        : AOI_LAYER_READINESS_STATUS.MISSING_CONFIG,
    },
    {
      source: "aoi-service-skeleton",
      configured: config.isConfigured,
    }
  );
}

export async function validateAoiFeatureLayer({ aoiLayer } = {}) {
  if (!aoiLayer) {
    return createSuccessResult(
      {
        status: AOI_LAYER_READINESS_STATUS.MISSING_CONFIG,
        isConfigured: false,
        featureCount: null,
        warnings: ["AOI Feature Service URL is not configured."],
      },
      {
        operation: "validateAoiFeatureLayer",
        configured: false,
      }
    );
  }

  try {
    await aoiLayer.load();
  } catch (error) {
    return createErrorResult(normalizeError(error, "AOI Feature Service could not be loaded."), {
      operation: "validateAoiFeatureLayer",
      layerId: aoiLayer.id,
    });
  }

  const fieldReport = createAoiFieldValidationReport(aoiLayer.fields, {
    objectIdField: aoiLayer.objectIdField,
    geometryType: aoiLayer.geometryType,
  });
  const featureCountResult = await queryAoiFeatureCount(aoiLayer);
  const featureCount = featureCountResult.ok ? featureCountResult.data.featureCount : null;
  const warnings = [...fieldReport.warnings];

  if (!featureCountResult.ok) {
    warnings.push(featureCountResult.error.message);
  } else if (featureCount === 0) {
    warnings.push("AOI Feature Service returned no features.");
  }

  return createSuccessResult(
    {
      status: resolveReadinessStatus({
        fieldReport,
        featureCountResult,
        featureCount,
      }),
      isConfigured: true,
      layerId: aoiLayer.id,
      layerTitle: normalizeOptionalString(aoiLayer.title),
      url: normalizeOptionalString(aoiLayer.url),
      geometryType: normalizeOptionalString(aoiLayer.geometryType),
      objectIdField: normalizeOptionalString(aoiLayer.objectIdField),
      spatialReference: serializeSpatialReference(aoiLayer.spatialReference),
      featureCount,
      fieldReport,
      warnings,
    },
    {
      operation: "validateAoiFeatureLayer",
      configured: true,
      warningCount: warnings.length,
    }
  );
}

async function queryAoiFeatureCount(aoiLayer) {
  if (typeof aoiLayer.queryFeatureCount !== "function") {
    return createErrorResult(new Error("AOI feature count could not be checked."), {
      operation: "queryAoiFeatureCount",
      reason: "queryFeatureCount-missing",
    });
  }

  try {
    const query =
      typeof aoiLayer.createQuery === "function"
        ? aoiLayer.createQuery()
        : {
            where: "1=1",
          };

    query.where = "1=1";

    const featureCount = await aoiLayer.queryFeatureCount(query);

    return createSuccessResult(
      {
        featureCount: normalizeCount(featureCount),
      },
      {
        operation: "queryAoiFeatureCount",
      }
    );
  } catch (error) {
    return createErrorResult(normalizeError(error, "AOI feature count could not be checked."), {
      operation: "queryAoiFeatureCount",
    });
  }
}

function resolveReadinessStatus({ fieldReport, featureCountResult, featureCount }) {
  if (!fieldReport.hasRequiredFields || !featureCountResult.ok || featureCount === 0) {
    return AOI_LAYER_READINESS_STATUS.WARNING;
  }

  return AOI_LAYER_READINESS_STATUS.READY;
}

function serializeSpatialReference(spatialReference) {
  if (!spatialReference) {
    return null;
  }

  if (typeof spatialReference.toJSON === "function") {
    return spatialReference.toJSON();
  }

  return {
    wkid: spatialReference.wkid ?? null,
    latestWkid: spatialReference.latestWkid ?? null,
  };
}

function normalizeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count < 0) {
    return 0;
  }

  return Math.trunc(count);
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}
