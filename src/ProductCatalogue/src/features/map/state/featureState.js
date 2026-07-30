import { getStatusIdByName, isFrozenStatus } from "../../data/stores/statusStore.js";
import { getCorrectionSymbol } from "../symbology/correctionSymbols.js";

const FROZEN_STATUS_NAME = "Frozen";
const TEMPORARY_FROZEN_STATUS_NAME = "In Transit";
const READY_STATUS_NAME = "Ready";

export function isGraphicFrozen(graphic) {
  return isStatusFrozen(graphic?.attributes?.status);
}

export function isStatusFrozen(status) {
  return isFrozenStatus(normalizeStatusValue(status));
}

export function applyGraphicAttributes(graphic, attributes) {
  if (!graphic || !attributes) {
    return graphic?.attributes ?? {};
  }

  const normalizedAttributes = normalizeGraphicAttributes(attributes);
  const nextAttributes = {
    ...(graphic.attributes ?? {}),
    ...normalizedAttributes,
  };

  // Keep the direct property updated because popup rendering reads it synchronously.
  graphic.attributes = nextAttributes;

  if (typeof graphic.set === "function") {
    graphic.set("attributes", nextAttributes);
  }

  updateGraphicSymbol(graphic);

  return nextAttributes;
}

export function applyGraphicFrozenResult(graphic, frozen, result) {
  const status = getStatusFromResult(result) ?? getFallbackFrozenStatus(frozen);

  applyGraphicAttributes(graphic, {
    status,
  });
}

export function getFallbackFrozenStatus(frozen) {
  if (frozen) {
    return (
      getStatusIdByName(FROZEN_STATUS_NAME) ??
      getStatusIdByName(TEMPORARY_FROZEN_STATUS_NAME) ??
      TEMPORARY_FROZEN_STATUS_NAME
    );
  }

  return getStatusIdByName(READY_STATUS_NAME) ?? READY_STATUS_NAME;
}

function normalizeGraphicAttributes(attributes) {
  const normalized = {
    ...attributes,
  };

  copyAttributeIfPresent(normalized, attributes, "DatasetName", "datasetName");
  copyAttributeIfPresent(normalized, attributes, "datasetname", "datasetName");
  copyAttributeIfPresent(normalized, attributes, "Edition", "edition");
  copyAttributeIfPresent(normalized, attributes, "Update", "update");
  copyAttributeIfPresent(normalized, attributes, "Status", "status");
  copyAttributeIfPresent(normalized, attributes, "ProductState", "status");
  copyAttributeIfPresent(normalized, attributes, "productState", "status");
  copyAttributeIfPresent(normalized, attributes, "ErrorMessage", "errorMessage");

  if (Object.hasOwn(normalized, "status")) {
    normalized.status = normalizeStatusValue(normalized.status);
  }

  return normalized;
}

function copyAttributeIfPresent(target, source, fromKey, toKey) {
  if (Object.hasOwn(source, fromKey)) {
    target[toKey] = source[fromKey];
  }
}

function normalizeStatusValue(status) {
  if (status && typeof status === "object") {
    const statusValue = status.Id ?? status.id ?? status.Name ?? status.name ?? null;
    return normalizeStatusValue(statusValue);
  }

  if (status === null || status === undefined) {
    return status;
  }

  return getStatusIdByName(status) ?? status;
}

function getStatusFromResult(result) {
  const data = result?.data;

  if (!data || typeof data !== "object") {
    return null;
  }

  const status =
    data.status ??
    data.Status ??
    data.state ??
    data.State ??
    data.productState ??
    data.ProductState ??
    data.properties?.status ??
    data.properties?.Status;

  return normalizeStatusValue(status);
}

function updateGraphicSymbol(graphic) {
  const status = graphic?.attributes?.status;

  if (status === undefined || status === null) {
    return;
  }

  graphic.symbol = getCorrectionSymbol(status, {
    variant: "detail",
  });
}
