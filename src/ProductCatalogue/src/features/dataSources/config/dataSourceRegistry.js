export const DATA_SOURCE_AVAILABILITY = Object.freeze({
  AVAILABLE: "available",
  UNAVAILABLE: "unavailable",
});

export const DATA_SOURCE_IDS = Object.freeze({
  S57: "s57",
  S101: "s101",
  PAPER_CHARTS: "paper-charts",
  S102: "s102",
});

export const DATA_SOURCE_LAYER_IDS = Object.freeze({
  PAPER_CHARTS_PRODUCTS: "paper-charts-products",
  S102_PRODUCTS: "s102-products",
});

const DISABLED_OPERATION_CAPABILITIES = Object.freeze({
  freeze: false,
  unfreeze: false,
  sendToIcEnc: false,
  cancelExport: false,
  history: false,
  icEncReports: false,
  internalValidation: false,
  exportEdition: false,
  exportUpdate: false,
  popupExport: false,
  productCollection: false,
  productSearch: false,
  analyze: false,
  review: false,
  backendProductRefresh: false,
});

const SEARCHABLE_VISUALIZATION_CAPABILITIES = Object.freeze({
  ...DISABLED_OPERATION_CAPABILITIES,
  popupExport: true,
  productSearch: true,
});

const ACTIVE_ONLY_REFRESH = Object.freeze({
  mode: "active-only",
  reloadOnReactivate: true,
  retainLastSuccessfulRepresentationOnError: true,
});

const SOURCE_AWARE_IDENTITY = Object.freeze({
  type: "stable-product-key",
  fields: Object.freeze(["productKey", "datasetName", "productName", "OBJECTID", "id"]),
  allowFeatureId: true,
  sourceAware: true,
});

const GEOJSON_PRODUCT_NORMALIZER = Object.freeze({
  type: "geojson-products",
});

const DEFAULT_PRODUCT_SEARCH = Object.freeze({
  supported: true,
  fields: Object.freeze(["datasetName", "productName", "productKey"]),
});

export function createDataSourceRegistry({
  isDevelopment = Boolean(import.meta.env?.DEV),
  configuredSourceIds,
} = {}) {
  const configuredIds = normalizeConfiguredSourceIds(configuredSourceIds);
  const definitions = [
    createUnavailableSource({
      id: DATA_SOURCE_IDS.S57,
      label: "S-57",
      productType: "s57-product",
      configuredIds,
      reason: "An authoritative S-57 read contract is not available yet.",
    }),
    createUnavailableSource({
      id: DATA_SOURCE_IDS.S101,
      label: "S-101",
      productType: "s101-product",
      configuredIds,
      reason: "An authoritative S-101 read contract is not available yet.",
    }),
    createDevelopmentMockSource({
      id: DATA_SOURCE_IDS.PAPER_CHARTS,
      label: "Paper Charts",
      productType: "paper-chart",
      endpoint: "mock/paper-charts",
      layerId: DATA_SOURCE_LAYER_IDS.PAPER_CHARTS_PRODUCTS,
      layerKind: "paper-chart-products",
      filterDefinitions: ["status", "displayScale", "usageBand"],
      isDevelopment,
      configuredIds,
    }),
    createDevelopmentMockSource({
      id: DATA_SOURCE_IDS.S102,
      label: "S-102",
      productType: "s102-product",
      endpoint: "mock/s102",
      layerId: DATA_SOURCE_LAYER_IDS.S102_PRODUCTS,
      layerKind: "s102-products",
      filterDefinitions: ["status"],
      isDevelopment,
      configuredIds,
    }),
  ];

  return freezeRegistry(definitions);
}

export function getDataSourceDefinition(registry, sourceId) {
  return registry.byId.get(normalizeSourceId(sourceId)) ?? null;
}

export function getRuntimeSelectableDataSources(registry) {
  return registry.definitions.filter(isRuntimeSelectableDataSource);
}

export function getDefaultEnabledSourceIds(registry) {
  return getRuntimeSelectableDataSources(registry)
    .filter((source) => source.defaultEnabled)
    .map((source) => source.id);
}

export function isRuntimeSelectableDataSource(source) {
  return Boolean(
    source?.enabledByConfiguration &&
    source?.userSelectable &&
    source?.availability?.state === DATA_SOURCE_AVAILABILITY.AVAILABLE &&
    source?.loader
  );
}

function createUnavailableSource({ id, label, productType, configuredIds, reason }) {
  return {
    id,
    label,
    enabledByConfiguration: isConfigured(id, configuredIds),
    availability: {
      state: DATA_SOURCE_AVAILABILITY.UNAVAILABLE,
      reason,
    },
    userSelectable: false,
    defaultEnabled: true,
    loader: null,
    normalizer: GEOJSON_PRODUCT_NORMALIZER,
    identityStrategy: SOURCE_AWARE_IDENTITY,
    layerDefinitions: [],
    capabilities: DISABLED_OPERATION_CAPABILITIES,
    exportConfiguration: null,
    filtering: {
      supported: false,
      definitions: [],
      defaultExcludedValues: [],
      useLookupOptions: false,
    },
    search: {
      supported: false,
      fields: DEFAULT_PRODUCT_SEARCH.fields,
    },
    productType,
    refreshStrategy: ACTIVE_ONLY_REFRESH,
  };
}

function createDevelopmentMockSource({
  id,
  label,
  productType,
  endpoint,
  layerId,
  layerKind,
  filterDefinitions,
  isDevelopment,
  configuredIds,
}) {
  const enabledByConfiguration = isConfigured(id, configuredIds) && isDevelopment;
  const exportUnavailableReason = `${label} export is not available yet.`;

  return {
    id,
    label,
    enabledByConfiguration,
    availability: enabledByConfiguration
      ? {
          state: DATA_SOURCE_AVAILABILITY.AVAILABLE,
          reason: null,
        }
      : {
          state: DATA_SOURCE_AVAILABILITY.UNAVAILABLE,
          reason: "The development-only mock source is unavailable in this environment.",
        },
    userSelectable: enabledByConfiguration,
    defaultEnabled: true,
    loader: enabledByConfiguration
      ? {
          type: "http-json",
          path: endpoint,
          errorMessage: `${label} mock request failed`,
        }
      : null,
    normalizer: GEOJSON_PRODUCT_NORMALIZER,
    identityStrategy: SOURCE_AWARE_IDENTITY,
    layerDefinitions: [
      {
        id: layerId,
        title: label,
        type: "graphics",
        dataFormat: "geojson",
        layerKind,
        capabilities: {
          supportsPopup: true,
          supportsPopupActions: true,
          supportsProductActions: false,
          supportsDisplayScale: false,
          supportsAttributeFilters: true,
          supportsProductHistory: false,
          supportsOverlapPicker: true,
          supportsProductSearch: true,
        },
      },
    ],
    capabilities: SEARCHABLE_VISUALIZATION_CAPABILITIES,
    exportConfiguration: createUnavailableExportConfiguration(exportUnavailableReason),
    filtering: {
      supported: true,
      definitions: filterDefinitions,
      defaultExcludedValues: [],
      useLookupOptions: false,
    },
    search: DEFAULT_PRODUCT_SEARCH,
    productType,
    refreshStrategy: ACTIVE_ONLY_REFRESH,
  };
}

function createUnavailableExportConfiguration(availabilityReason) {
  return {
    visible: true,
    leaves: [
      {
        id: "export-edition",
        label: "Edition",
        operationKind: "Edition",
        capability: "exportEdition",
        visible: true,
        implemented: false,
        backendTarget: null,
        handlerId: null,
        availabilityReason,
      },
      {
        id: "export-update",
        label: "Update",
        operationKind: "Update",
        capability: "exportUpdate",
        visible: true,
        implemented: false,
        backendTarget: null,
        handlerId: null,
        availabilityReason,
      },
    ],
  };
}

function freezeRegistry(definitions) {
  const frozenDefinitions = definitions.map(deepFreeze);
  const byId = new Map(frozenDefinitions.map((definition) => [definition.id, definition]));

  return Object.freeze({
    definitions: Object.freeze(frozenDefinitions),
    byId,
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

function normalizeConfiguredSourceIds(configuredSourceIds) {
  if (configuredSourceIds === undefined || configuredSourceIds === null) {
    return null;
  }

  return new Set(
    (Array.isArray(configuredSourceIds) ? configuredSourceIds : [configuredSourceIds])
      .map(normalizeSourceId)
      .filter(Boolean)
  );
}

function isConfigured(sourceId, configuredIds) {
  return configuredIds === null || configuredIds.has(sourceId);
}

function normalizeSourceId(value) {
  return String(value ?? "").trim();
}
