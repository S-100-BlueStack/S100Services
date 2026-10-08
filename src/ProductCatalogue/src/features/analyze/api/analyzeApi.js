import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";
import { normalizeArtifactHistory } from "../../data/normalizers/productArtifact.js";
import { apiGet } from "../../../shared/api/apiClient.js";
import { normalizeProductExportMetadata } from "../../data/normalizers/productExportMetadata.js";
import {
  PRODUCT_CONTENT_TYPE,
  getProductContentConfiguration,
  isCompatibilityProductContext,
} from "../../products/domain/productContext.js";
import {
  WORKSPACE_PRODUCT_RESOLUTION_STATUS,
  getDefaultWorkspaceProductService,
} from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { reconcileAnalyzeResolutions } from "../domain/analyzeWorkUnits.js";
import { normalizeInternalValidationReports } from "../domain/internalValidationReports.js";
import { selectPackageValidationArtifacts } from "../domain/packageValidationArtifacts.js";

const ANALYZE_PRODUCT_ENDPOINT = "electronicproducts";

export async function resolveAnalyzeWorkUnits(
  datasetNames,
  {
    workspaceProductService = getDefaultWorkspaceProductService(),
    workspaceWorkUnitService = createWorkspaceWorkUnitService({
      productService: workspaceProductService,
    }),
  } = {}
) {
  const resolutions = [];
  const aliases = new Set();
  // Alias reuse is scoped to this composition. Reloads validate current mappings.
  for (const datasetName of [...new Set(datasetNames)]) {
    const key = datasetName.trim().toUpperCase();
    if (aliases.has(key)) continue;
    const resolution = await workspaceWorkUnitService.resolveWorkUnit(datasetName);
    resolutions.push({ ...resolution, requestedDatasetName: datasetName });
    aliases.add(key);
    for (const member of resolution.workUnit?.members ?? []) {
      aliases.add(member.datasetName.toUpperCase());
    }
  }
  return reconcileAnalyzeResolutions(resolutions);
}

export async function fetchAnalyzeProducts(datasetNames, options = {}) {
  const resolutions = reconcileAnalyzeResolutions(
    options.resolutions ?? (await resolveAnalyzeWorkUnits(datasetNames, options))
  );
  return Promise.all(
    resolutions.map((resolution) =>
      fetchResolvedAnalyzeProduct(
        resolution.requestedDatasetName,
        resolution,
        options.get ?? apiGet,
        options.reuseDetails !== false
      )
    )
  );
}

async function fetchResolvedAnalyzeProduct(datasetName, resolution, get, reuseDetails) {
  if (resolution.status !== WORKSPACE_PRODUCT_RESOLUTION_STATUS.RESOLVED) {
    return createFailedAnalyzeProduct(datasetName, resolution);
  }
  if (resolution.workUnit?.kind === "package") {
    const representative = resolution.product;
    try {
      const geometry = representative.data?.geometry;
      if (!isAnalyzePackageGeometry(geometry)) {
        throw new Error("Package shared AOI geometry is unavailable.");
      }
      const members = await Promise.all(
        resolution.workUnit.members.map(async (member, index) => {
          const context = resolution.memberProducts?.[index];
          if (
            !context ||
            context.datasetName.toUpperCase() !== member.datasetName.toUpperCase() ||
            context.sourceId !== member.sourceId
          ) {
            throw new Error("Package member Product context is incomplete or contradictory.");
          }
          const product = await fetchElectronicAnalyzeProduct(
            context,
            get,
            reuseDetails ? resolution.productDetails?.[member.datasetName] : null,
            resolution.workUnit
          );
          if (product.workspaceLoadState !== "loaded") throw new Error(product.loadError);
          return { ...product, memberKey: member.key, memberLabel: member.label };
        })
      );
      const primary = members.find(
        (member) => member.memberKey === resolution.workUnit.primaryMemberKey
      );
      if (!primary || members.length < 2) throw new Error("Package Analyze model is incomplete.");
      return {
        ...primary,
        productContext: representative,
        aoiGeometry: geometry,
        sourceFeature: null,
        workUnit: resolution.workUnit,
        members,
      };
    } catch (error) {
      return {
        ...createFailedAnalyzeProduct(representative.datasetName, {
          product: representative,
          error: error.message,
        }),
        workUnit: resolution.workUnit,
      };
    }
  }
  const productContext = resolution.product;
  if (isCompatibilityProductContext(productContext)) {
    return fetchCompatibilityAnalyzeProduct(datasetName, { productContext, get });
  }
  if (productContext.capabilities?.backendProductRefresh) {
    return fetchElectronicAnalyzeProduct(productContext, get);
  }
  return createSourceAnalyzeProduct(productContext);
}

export function isAnalyzePackageGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return false;
  if (Number.isFinite(geometry.x) && Number.isFinite(geometry.y)) return true;
  const position = (value) =>
    Array.isArray(value) && value.length >= 2 && value.every(Number.isFinite);
  if (Array.isArray(geometry.points) && geometry.points.length > 0) {
    return geometry.points.every(position);
  }
  return [geometry.rings, geometry.paths].some(
    (parts) =>
      Array.isArray(parts) &&
      parts.length > 0 &&
      parts.every((part) => Array.isArray(part) && part.length >= 2 && part.every(position))
  );
}

async function fetchCompatibilityAnalyzeProduct(datasetName, { productContext, get }) {
  try {
    const payload = await get(
      `${ANALYZE_PRODUCT_ENDPOINT}/${encodeURIComponent(datasetName)}/aoi`,
      `Analyze data request failed for ${datasetName}`
    );
    return normalizeAnalyzeProduct(payload, datasetName, { productContext });
  } catch (error) {
    return createFailedAnalyzeProduct(datasetName, {
      product: productContext,
      error: error instanceof Error ? error.message : "Unknown analyze data error",
    });
  }
}

function normalizeAnalyzeProduct(
  payload,
  requestedDatasetName,
  { isMock = false, loadError = null, productContext = null } = {}
) {
  const product = getAnalyzeProductPayload(payload);
  const datasetName =
    readFirstDefined(product, ["datasetName", "DatasetName", "name", "Name"]) ??
    requestedDatasetName;

  return {
    datasetName,
    name: datasetName,
    sourceId: productContext?.sourceId ?? null,
    sourceLabel: productContext?.sourceLabel ?? null,
    productKey: productContext?.productKey ?? datasetName,
    productType: productContext?.productType ?? null,
    productContext,
    workspaceLoadState: "loaded",
    contentAvailability: createContentAvailability(productContext),
    status: normalizeOptionalStatus(
      readFirstDefined(product, ["status", "Status", "productState", "ProductState"])
    ),
    edition: readFirstDefined(product, ["edition", "Edition"]) ?? "-",
    update: readFirstDefined(product, ["update", "Update", "updateNumber", "UpdateNumber"]) ?? "-",
    usageBand: readFirstDefined(product, ["usageBand", "UsageBand"]) ?? "-",
    issueDate: readFirstDefined(product, ["issueDate", "IssueDate"]) ?? "-",
    // Only read the top-level product error message. Do not read Data.Exports[*].
    errorMessage: readFirstDefined(product, ["errorMessage", "ErrorMessage"]) ?? "",
    // The analyze AOI endpoint currently returns Esri JSON as Data.Geometry.
    // Older payloads may still use Aoi/AOI/aoiGeometry, so keep all aliases here.
    aoiGeometry:
      readFirstDefined(product, [
        "aoiGeometry",
        "AoiGeometry",
        "aoi",
        "Aoi",
        "AOI",
        "geometry",
        "Geometry",
      ]) ?? null,
    sourceFeature: null,
    xml: readFirstDefined(product, ["xml", "Xml", "XML", "reportXml", "ReportXml"]) ?? null,
    internalValidationReports: normalizeInternalValidationReports(
      readFirstDefined(product, [
        "internalValidationReports",
        "InternalValidationReports",
        "internalValidation",
        "InternalValidation",
        "validationReports",
        "ValidationReports",
        "validation",
        "Validation",
      ])
    ),
    raw: payload,
    isMock,
    loadError,
    exportMetadata:
      product.exportMetadata ??
      normalizeProductExportMetadata(readFirstDefined(product, ["exports", "Exports"])),
  };
}

function createSourceAnalyzeProduct(productContext) {
  const attributes = productContext.data?.attributes ?? {};
  const datasetName = productContext.datasetName;

  return {
    datasetName,
    name: datasetName,
    sourceId: productContext.sourceId,
    sourceLabel: productContext.sourceLabel,
    productKey: productContext.productKey,
    productType: productContext.productType,
    productContext,
    workspaceLoadState: "loaded",
    contentAvailability: createContentAvailability(productContext),
    status: normalizeOptionalStatus(readFirstDefined(attributes, ["status", "productState"])),
    edition: readFirstDefined(attributes, ["edition"]) ?? null,
    update: readFirstDefined(attributes, ["update", "updateNumber"]) ?? null,
    usageBand: readFirstDefined(attributes, ["usageBand"]) ?? null,
    issueDate: readFirstDefined(attributes, ["issueDate"]) ?? null,
    errorMessage: readFirstDefined(attributes, ["errorMessage"]) ?? "",
    aoiGeometry: null,
    sourceFeature: productContext.data?.feature ?? null,
    xml: null,
    internalValidationReports: [],
    raw: {
      attributes: { ...attributes },
    },
    isMock: false,
    loadError: null,
    exportMetadata: normalizeProductExportMetadata(undefined),
  };
}

function createFailedAnalyzeProduct(datasetName, resolution) {
  const productContext = resolution?.product ?? null;
  const normalizedDatasetName = String(productContext?.datasetName ?? datasetName ?? "").trim();
  return {
    datasetName: normalizedDatasetName,
    name: normalizedDatasetName,
    sourceId: productContext?.sourceId ?? null,
    sourceLabel: productContext?.sourceLabel ?? null,
    productKey: productContext?.productKey ?? null,
    productType: productContext?.productType ?? null,
    productContext,
    workspaceLoadState: "failed",
    contentAvailability: productContext ? createContentAvailability(productContext) : null,
    status: null,
    edition: null,
    update: null,
    usageBand: null,
    issueDate: null,
    errorMessage: "",
    aoiGeometry: null,
    sourceFeature: null,
    xml: null,
    internalValidationReports: [],
    raw: null,
    isMock: false,
    loadError:
      resolution?.error ??
      (resolution?.status === WORKSPACE_PRODUCT_RESOLUTION_STATUS.NOT_FOUND
        ? `Product ${normalizedDatasetName} was not found in the workspace catalog.`
        : "Product resolution failed."),
    exportMetadata: normalizeProductExportMetadata(undefined),
  };
}

function createContentAvailability(productContext) {
  if (!productContext) {
    return null;
  }

  return {
    history: getProductContentConfiguration(productContext, PRODUCT_CONTENT_TYPE.HISTORY),
    icEncReports: getProductContentConfiguration(
      productContext,
      PRODUCT_CONTENT_TYPE.IC_ENC_REPORTS
    ),
    internalValidation: getProductContentConfiguration(
      productContext,
      PRODUCT_CONTENT_TYPE.INTERNAL_VALIDATION
    ),
  };
}

function getAnalyzeProductPayload(payload) {
  const data = payload?.Data ?? payload?.data;
  if (isPlainObject(data)) {
    const attributes = readFirstDefined(data, ["Attributes", "attributes"]);
    if (isPlainObject(attributes)) {
      return {
        ...data,
        ...attributes,
        // Geometry belongs to the AOI wrapper in the current backend contract,
        // while product metadata may later move into Attributes.
        Geometry:
          readFirstDefined(data, ["Geometry", "geometry"]) ??
          readFirstDefined(attributes, ["Geometry", "geometry"]),
        geometry:
          readFirstDefined(data, ["geometry", "Geometry"]) ??
          readFirstDefined(attributes, ["geometry", "Geometry"]),
      };
    }

    return data;
  }
  if (isPlainObject(payload)) {
    return payload;
  }

  return {};
}

function readFirstDefined(source, keys) {
  if (!isPlainObject(source)) {
    return undefined;
  }

  for (const key of keys) {
    if (Object.hasOwn(source, key) && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function normalizeStatus(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function normalizeOptionalStatus(value) {
  return value === undefined || value === null || value === "" ? null : normalizeStatus(value);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function fetchElectronicAnalyzeProduct(productContext, get, detail = null, workUnit = null) {
  const datasetName = productContext.datasetName;
  const base = `${ANALYZE_PRODUCT_ENDPOINT}/${encodeURIComponent(datasetName)}`;
  try {
    const [metadata, artifacts] = await Promise.allSettled([
      detail
        ? Promise.resolve(detail)
        : get(base, `Product metadata request failed for ${datasetName}`),
      get(`${base}/artifacts/history`, `Validation artifact history failed for ${datasetName}`),
    ]);
    if (metadata.status === "rejected") throw metadata.reason;
    if (metadata.value?.Success === false || metadata.value?.success === false) {
      throw new Error("Product metadata is unavailable.");
    }
    if (workUnit) {
      const current = metadata.value?.workUnitMetadata
        ? metadata.value
        : normalizeElectronicProductResponse(metadata.value);
      if (current.datasetName?.toUpperCase() !== datasetName.toUpperCase()) {
        throw new Error("Package member metadata has no matching Product identity.");
      }
      for (const member of workUnit.members) {
        if (
          current.workUnitMetadata?.members?.[member.key]?.datasetName?.toUpperCase() !==
          member.datasetName.toUpperCase()
        ) {
          throw new Error("Package member metadata contradicts the resolved work unit.");
        }
      }
    }
    const product = normalizeAnalyzeProduct(metadata.value, datasetName, { productContext });
    if (product.datasetName.toLowerCase() !== datasetName.toLowerCase()) {
      throw new Error("Product identity mismatch.");
    }
    product.aoiGeometry = productContext.data?.geometry ?? null;
    product.internalValidationReports = [];
    try {
      if (artifacts.status === "rejected") throw artifacts.reason;
      const history = normalizeArtifactHistory(artifacts.value);
      const selection = workUnit
        ? selectPackageValidationArtifacts(history, productContext)
        : { artifacts: history, hasUnattributedArtifacts: false };
      if (selection.hasUnattributedArtifacts) {
        product.loadError =
          "Some validation artifacts have ambiguous or missing Product ownership and were not displayed.";
      }
      product.internalValidationReports = selection.artifacts.map((artifact) => ({
        id: artifact.id,
        title: artifact.fileName,
        status: "available",
        source: artifact.productSpecificationLabel,
        generatedAt: artifact.createdAtUtc,
        format: artifact.mediaType,
        url: artifact.url,
        summary: `Validation diagnostic for ${artifact.datasetName}.`,
        content: "",
        raw: artifact,
      }));
    } catch (error) {
      product.loadError = error?.message ?? "Validation artifact history could not be loaded.";
    }
    return product;
  } catch (error) {
    return createFailedAnalyzeProduct(datasetName, {
      product: productContext,
      error: error.message,
    });
  }
}
