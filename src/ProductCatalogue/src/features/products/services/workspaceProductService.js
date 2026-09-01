import { apiGet } from "../../../shared/api/apiClient.js";
import {
  createDataSourceRegistry,
  isWorkspaceAvailableDataSource,
} from "../../dataSources/config/dataSourceRegistry.js";
import { createDataSourceLoader } from "../../dataSources/services/dataSourceLoader.js";
import { normalizeDataSourcePayload } from "../../dataSources/services/dataSourceNormalizer.js";
import {
  createCompatibilityWorkspaceProductContext,
  createWorkspaceProductContext,
} from "../domain/productContext.js";
import { normalizeProductCatalog } from "../domain/productCatalog.js";

const PRODUCT_CATALOG_ENDPOINT = "electronicproducts";
const COMPATIBILITY_PROVIDER_ID = "compatibility-aoi";
const AMBIGUOUS_DATASET_NAME_REASON = "ambiguous-dataset-name";

export const WORKSPACE_PRODUCT_RESOLUTION_STATUS = Object.freeze({
  RESOLVED: "resolved",
  NOT_FOUND: "not-found",
  FAILED: "failed",
});

let defaultWorkspaceProductService = null;

export function getDefaultWorkspaceProductService() {
  defaultWorkspaceProductService ??= createWorkspaceProductService();
  return defaultWorkspaceProductService;
}

export function createWorkspaceProductService({
  registry = createDataSourceRegistry(),
  loadSource = createDataSourceLoader(),
  normalizeSource = normalizeDataSourcePayload,
  loadCompatibilityCatalog = fetchCompatibilityCatalogPayload,
} = {}) {
  let committedSnapshot = null;
  let loadGeneration = 0;

  async function loadCatalog({ force = false } = {}) {
    if (!force && committedSnapshot) {
      return createPublicCatalog(committedSnapshot);
    }

    const generation = ++loadGeneration;
    const providers = createProviders({
      registry,
      loadSource,
      normalizeSource,
      loadCompatibilityCatalog,
    });
    const settledResults = await Promise.allSettled(providers.map((provider) => provider.load()));
    const snapshot = createWorkspaceSnapshot(providers, settledResults);

    // A slower, older request must not replace a newer committed provider snapshot.
    if (generation === loadGeneration) {
      committedSnapshot = snapshot;
    }

    if (snapshot.successfulProviderCount === 0) {
      const error = new Error("Product catalog could not be loaded from any workspace provider.");
      error.providerErrors = snapshot.providerErrors;
      throw error;
    }

    return createPublicCatalog(snapshot);
  }

  async function resolveProduct(datasetName, { force = false } = {}) {
    const normalizedDatasetName = normalizeText(datasetName);
    if (!normalizedDatasetName) {
      return createNotFoundResolution(datasetName);
    }

    if (force || !committedSnapshot) {
      try {
        await loadCatalog({ force });
      } catch (error) {
        return createFailedResolution(normalizedDatasetName, error?.providerErrors ?? []);
      }
    }

    const key = createDatasetKey(normalizedDatasetName);
    const identityError = committedSnapshot?.identityErrorsByDatasetName.get(key) ?? null;
    if (identityError) {
      return createAmbiguousResolution(normalizedDatasetName, identityError, committedSnapshot);
    }

    const product = committedSnapshot?.resolutionsByDatasetName.get(key) ?? null;
    if (product) {
      return {
        status: WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED,
        datasetName: product.datasetName,
        product,
        providerErrors: committedSnapshot.providerErrors,
      };
    }

    if (committedSnapshot?.providerErrors.length) {
      return createFailedResolution(normalizedDatasetName, committedSnapshot.providerErrors);
    }

    return createNotFoundResolution(normalizedDatasetName);
  }

  function invalidate() {
    loadGeneration += 1;
    committedSnapshot = null;
  }

  return {
    loadCatalog,
    resolveProduct,
    invalidate,
  };
}

function createProviders({ registry, loadSource, normalizeSource, loadCompatibilityCatalog }) {
  const providers = [
    {
      id: COMPATIBILITY_PROVIDER_ID,
      async load() {
        const payload = await loadCompatibilityCatalog();
        const products = normalizeProductCatalog(payload);
        const entries = products
          .map((product) =>
            createCompatibilityEntry(product.datasetName ?? product.name, {
              displayName: product.name,
            })
          )
          .filter(Boolean);
        return { entries };
      },
    },
  ];

  for (const source of registry?.definitions ?? []) {
    if (!isWorkspaceAvailableDataSource(source)) {
      continue;
    }

    providers.push({
      id: source.id,
      async load() {
        const payload = await loadSource(source);
        const normalized = normalizeSource(payload, source);
        return {
          entries: createRegistryEntries(source, normalized),
        };
      },
    });
  }

  return providers;
}

function createWorkspaceSnapshot(providers, settledResults) {
  const entriesByDatasetName = new Map();
  const resolutionsByDatasetName = new Map();
  const identityErrorsByDatasetName = new Map();
  const providerErrors = [];
  let successfulProviderCount = 0;

  for (const [index, result] of settledResults.entries()) {
    const provider = providers[index];
    if (result.status === "rejected") {
      providerErrors.push({
        providerId: provider.id,
        message: getErrorMessage(result.reason),
      });
      continue;
    }

    successfulProviderCount += 1;
    for (const entry of result.value.entries ?? []) {
      const key = createDatasetKey(entry.context.datasetName);
      if (!key) {
        continue;
      }

      const entries = entriesByDatasetName.get(key) ?? [];
      entries.push({ providerId: provider.id, entry });
      entriesByDatasetName.set(key, entries);
    }
  }

  const catalogProducts = [];
  for (const [key, entries] of entriesByDatasetName.entries()) {
    if (entries.length !== 1) {
      identityErrorsByDatasetName.set(key, createDatasetIdentityError(entries));
      continue;
    }

    const [{ entry }] = entries;
    resolutionsByDatasetName.set(key, entry.context);
    catalogProducts.push(entry.summary);
  }

  catalogProducts.sort((left, right) => left.name.localeCompare(right.name));
  return {
    catalogProducts,
    resolutionsByDatasetName,
    identityErrorsByDatasetName,
    providerErrors,
    successfulProviderCount,
    complete: providerErrors.length === 0 && identityErrorsByDatasetName.size === 0,
  };
}

function createDatasetIdentityError(entries) {
  const datasetName = entries[0]?.entry?.context?.datasetName ?? "Unknown";
  const providers = entries.map(({ providerId, entry }) => ({
    providerId,
    sourceId: entry.context.sourceId,
    sourceLabel: entry.context.sourceLabel,
    productKey: entry.context.productKey,
  }));

  return {
    reason: AMBIGUOUS_DATASET_NAME_REASON,
    datasetName,
    providers,
    message:
      `Workspace Product datasetName "${datasetName}" is ambiguous across providers: ` +
      `${providers.map((provider) => provider.providerId).join(", ")}.`,
  };
}

function createCompatibilityEntry(datasetName, { displayName = null } = {}) {
  const context = createCompatibilityWorkspaceProductContext(datasetName);
  if (!context) {
    return null;
  }

  return {
    context,
    summary: createCatalogSummary(context, { displayName }),
  };
}

function createRegistryEntries(source, normalized) {
  const sourceFeatures = normalized?.layers?.[0]?.data?.features ?? [];
  const entries = [];

  for (const [index, attributes] of (normalized?.products ?? []).entries()) {
    const context = createWorkspaceProductContext({
      sourceId: source.id,
      sourceLabel: source.label,
      productKey: attributes.productKey,
      datasetName: attributes.datasetName,
      productType: source.productType,
      capabilities: source.capabilities,
      exportConfiguration: source.exportConfiguration,
      contentConfiguration: source.contentConfiguration,
      data: {
        attributes: { ...attributes },
        feature: sourceFeatures[index] ?? null,
      },
    });

    if (!context) {
      continue;
    }

    entries.push({
      context,
      summary: createCatalogSummary(context, {
        displayName: readProductDisplayName(attributes),
      }),
    });
  }

  return entries;
}

function createCatalogSummary(context, { displayName = null } = {}) {
  return {
    id: createDatasetKey(context.datasetName),
    // `name` remains the picker/route value until FI-019. User-facing labels are
    // carried separately so visible Product names never become route identity.
    name: context.datasetName,
    displayName: normalizeText(displayName) ?? context.datasetName,
    datasetName: context.datasetName,
    sourceId: context.sourceId,
    sourceLabel: context.sourceLabel,
    productKey: context.productKey,
    productType: context.productType,
  };
}

function readProductDisplayName(attributes) {
  return readFirstDefined(attributes, ["productName", "name"]) ?? attributes?.datasetName ?? null;
}

function readFirstDefined(source, names) {
  const normalizedNames = new Set(names.map(normalizePropertyName));
  for (const [name, value] of Object.entries(source ?? {})) {
    if (normalizedNames.has(normalizePropertyName(name)) && value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function normalizePropertyName(value) {
  return String(value ?? "")
    .trim()
    .replace(/[_\-\s]/g, "")
    .toLowerCase();
}

function createPublicCatalog(snapshot) {
  const products = snapshot.catalogProducts.map((product) => ({ ...product }));

  Object.defineProperties(products, {
    incomplete: {
      value: !snapshot.complete,
      enumerable: false,
    },
    providerErrors: {
      value: snapshot.providerErrors.map((error) => ({ ...error })),
      enumerable: false,
    },
    identityErrors: {
      value: [...snapshot.identityErrorsByDatasetName.values()].map(copyIdentityError),
      enumerable: false,
    },
  });

  return products;
}

function createAmbiguousResolution(datasetName, identityError, snapshot) {
  return {
    status: WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED,
    reason: AMBIGUOUS_DATASET_NAME_REASON,
    datasetName,
    product: null,
    providerErrors: snapshot?.providerErrors?.map((error) => ({ ...error })) ?? [],
    identityError: copyIdentityError(identityError),
    error: identityError.message,
  };
}

function copyIdentityError(identityError) {
  return {
    ...identityError,
    providers: (identityError.providers ?? []).map((provider) => ({ ...provider })),
  };
}

function createFailedResolution(datasetName, providerErrors) {
  return {
    status: WORKSPACE_PRODUCT_RESOLUTION_STATUS.FAILED,
    datasetName,
    product: null,
    providerErrors: (providerErrors ?? []).map((error) => ({ ...error })),
    error: "The Product could not be resolved because one or more workspace providers failed.",
  };
}

function createNotFoundResolution(datasetName) {
  return {
    status: WORKSPACE_PRODUCT_RESOLUTION_STATUS.NOT_FOUND,
    datasetName: normalizeText(datasetName),
    product: null,
    providerErrors: [],
    error: "The Product is not available from any runtime workspace source.",
  };
}

async function fetchCompatibilityCatalogPayload() {
  return apiGet(PRODUCT_CATALOG_ENDPOINT, "Product catalog request failed");
}

function createDatasetKey(value) {
  return normalizeText(value)?.toUpperCase() ?? null;
}

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown provider error.");
}
