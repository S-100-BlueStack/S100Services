import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import {
  createDataSourceRegistry,
  isWorkspaceAvailableDataSource,
} from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "./workspaceProductService.js";

/**
 * Canonical resolution is opt-in. Existing workspace callers retain exact Product
 * resolution until their package presentation and lifecycle are implemented.
 */
export function createWorkspaceWorkUnitService({
  registry = createDataSourceRegistry(),
  productService = createWorkspaceProductService({ registry }),
  fetchProduct = fetchProductPropertiesByDatasetName,
} = {}) {
  async function resolveWorkUnit(datasetName, options = {}) {
    const requestedDatasetName = text(datasetName);
    const providerErrors = [];
    // These maps belong to this request only; they cannot outlive caller freshness.
    const exactReads = new Map();
    const detailReads = new Map();
    const sources = [...(registry.definitions ?? [])];
    const sourceById = new Map(sources.map((source) => [source.id, source]));

    async function exact(name) {
      const key = identity(name);
      if (!exactReads.has(key)) {
        exactReads.set(key, productService.resolveProduct(name, options));
      }
      const result = await exactReads.get(key);
      for (const error of result?.providerErrors ?? []) {
        if (
          !providerErrors.some(
            (item) => item.providerId === error.providerId && item.message === error.message
          )
        ) {
          providerErrors.push({ ...error });
        }
      }
      return result;
    }

    async function detail(name) {
      const key = identity(name);
      if (!detailReads.has(key)) detailReads.set(key, fetchProduct(name));
      const result = await detailReads.get(key);
      requireContract(
        result?.success,
        result?.errorMessage ?? "Package Product detail request failed."
      );
      requireContract(
        identity(result.data?.datasetName) === key,
        "Package Product detail identity mismatch."
      );
      return result.data;
    }

    function validateSource(source) {
      requireContract(
        source &&
          registry.byId.get(source.id) === source &&
          registry.definitions.includes(source) &&
          isWorkspaceAvailableDataSource(source),
        "Package member source is missing, unavailable or replaced."
      );
      requireContract(
        source.normalizer?.type === "electronic-aoi" &&
          source.workspace?.resolution === "targeted-product-aoi",
        "Package member source does not support the electronic Product contract."
      );
    }

    function validateProduct(result, source, name) {
      validateSource(source);
      requireContract(
        result?.status === "resolved" &&
          result.product?.sourceId === source.id &&
          result.product?.productType === source.productType &&
          result.product?.data?.attributes?.sourceId === source.id &&
          result.product?.data?.attributes?.productSpecification ===
            source.normalizer.specification &&
          identity(result.product?.datasetName) === identity(name),
        "Exact package member resolution does not match the declared source and identity."
      );
      requireContract(
        JSON.stringify(result.product.workUnit) === JSON.stringify(source.workUnit ?? null),
        "Package Product declaration is stale or contradictory."
      );
    }

    try {
      const requested = await exact(requestedDatasetName);
      if (requested?.status !== "resolved") {
        return { ...requested, requestedDatasetName, workUnit: null };
      }
      const requestedProduct = requested.product;
      const requestedSource = sourceById.get(requestedProduct.sourceId);
      const ownerReference = text(requestedSource?.workspace?.workUnitSourceId);
      if (ownerReference) {
        const referencedOwner = sourceById.get(ownerReference);
        validateSource(referencedOwner);
        requireContract(
          referencedOwner.workUnit?.kind === "package",
          "Declared package owner source has no package declaration."
        );
        requireContract(
          Array.isArray(referencedOwner.workUnit.members) &&
            referencedOwner.workUnit.members.filter(
              (member) => member.sourceId === requestedProduct.sourceId
            ).length === 1,
          "Declared package owner must claim the requested source exactly once."
        );
      }
      const owners = sources.filter(
        (source) =>
          source.workUnit?.kind === "package" &&
          (source.id === requestedProduct.sourceId ||
            source.workUnit.members?.some(
              (member) => member.sourceId === requestedProduct.sourceId
            ))
      );
      requireContract(owners.length <= 1, "Product belongs to ambiguous package declarations.");
      if (!owners.length) {
        requireContract(
          !ownerReference && !requestedSource?.workUnit && !requestedProduct.workUnit,
          "Declared package membership cannot fall back to an ordinary Product."
        );
        return { ...requested, requestedDatasetName, workUnit: null };
      }

      const owner = owners[0];
      const declaration = owner.workUnit;
      requireContract(
        !ownerReference || ownerReference === owner.id,
        "Product package owner reference contradicts the member declaration."
      );
      validateSource(owner);
      const members = declaration.members;
      requireContract(
        Array.isArray(members) && members.length > 1,
        "Package member declaration is incomplete."
      );
      requireContract(
        new Set(members.map((member) => member.key)).size === members.length,
        "Package member keys are duplicated."
      );
      requireContract(
        new Set(members.map((member) => member.sourceId)).size === members.length,
        "Package member sources are duplicated."
      );
      const primary = members.find((member) => member.key === declaration.primaryMemberKey);
      requireContract(
        primary && primary.sourceId === owner.id,
        "Package primary member declaration is invalid."
      );
      for (const member of members) {
        const memberSource = sourceById.get(member.sourceId);
        validateSource(memberSource);
        // Check every member even when resolution entered through the primary.
        // A secondary back-reference must not authorize a different work unit.
        const memberOwnerReference = text(memberSource.workspace?.workUnitSourceId);
        requireContract(
          !memberOwnerReference || memberOwnerReference === owner.id,
          "Package member owner reference contradicts the selected package owner."
        );
      }
      const requestedMember = members.find(
        (member) => member.sourceId === requestedProduct.sourceId
      );
      requireContract(requestedMember, "Requested Product is not a declared package member.");
      validateProduct(requested, sourceById.get(requestedMember.sourceId), requestedDatasetName);

      const metadata = await detail(requestedProduct.datasetName);
      const concreteMembers = members.map((member) => {
        const name = text(metadata.workUnitMetadata?.members?.[member.key]?.datasetName);
        requireContract(name, `Package member ${member.key} has no dataset identity.`);
        return Object.freeze({
          key: member.key,
          label: member.label,
          exportStandard: member.exportStandard,
          sourceId: member.sourceId,
          datasetName: name,
        });
      });
      requireContract(
        new Set(concreteMembers.map((member) => identity(member.datasetName))).size ===
          members.length,
        "Package members share the same dataset identity."
      );
      const concreteRequested = concreteMembers.find(
        (member) => member.key === requestedMember.key
      );
      requireContract(
        identity(concreteRequested.datasetName) === identity(requestedProduct.datasetName),
        "Package metadata contradicts the requested member identity."
      );

      const primaryName = concreteMembers.find((member) => member.key === primary.key).datasetName;
      let canonical;
      for (const member of concreteMembers) {
        const result = await exact(member.datasetName);
        validateProduct(result, sourceById.get(member.sourceId), member.datasetName);
        if (member.key === primary.key) canonical = result;
      }
      // A secondary entry must agree with the representative's current mapping.
      // Otherwise a remapped member could publish an obsolete package identity.
      const canonicalMetadata = await detail(primaryName);
      for (const member of concreteMembers) {
        requireContract(
          identity(canonicalMetadata.workUnitMetadata?.members?.[member.key]?.datasetName) ===
            identity(member.datasetName),
          "Canonical package metadata contradicts the member mapping."
        );
        validateSource(sourceById.get(member.sourceId));
      }
      requireContract(
        owner.workUnit === declaration,
        "Package declaration was replaced during resolution."
      );
      return {
        ...canonical,
        requestedDatasetName,
        providerErrors,
        workUnit: Object.freeze({
          kind: declaration.kind,
          identityKey: JSON.stringify([declaration.kind, owner.id, identity(primaryName)]),
          primaryMemberKey: declaration.primaryMemberKey,
          members: Object.freeze(concreteMembers),
        }),
      };
    } catch (error) {
      return {
        status: "failed",
        requestedDatasetName,
        datasetName: requestedDatasetName,
        product: null,
        workUnit: null,
        providerErrors,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return { resolveWorkUnit };
}

function requireContract(condition, message) {
  if (!condition) throw new Error(message);
}

function text(value) {
  return String(value ?? "").trim() || null;
}

function identity(value) {
  return text(value)?.toUpperCase() ?? null;
}
