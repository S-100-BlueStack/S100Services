import { serializeProductIdentity } from "../../dataSources/domain/productIdentity.js";
import { fetchProductHistory } from "../api/productHistoryApi.js";
import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import {
  createDataSourceRegistry,
  isWorkspaceAvailableDataSource,
} from "../../dataSources/config/dataSourceRegistry.js";

const identity = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export function isPackageHistoryContext(context, registry) {
  const source = registry.byId.get(context?.sourceId);
  return Boolean(context?.workUnit || source?.workUnit || source?.workspace?.workUnitSourceId);
}

// The panel owns cancellation. This loader only proves identity and returns a
// complete snapshot; optional member content failures never weaken that proof.
export async function loadPackageHistory(
  datasetName,
  {
    productContext,
    registry = createDataSourceRegistry(),
    workUnitService = createWorkspaceWorkUnitService({ registry }),
    fetchHistory = fetchProductHistory,
    fetchProduct = fetchProductPropertiesByDatasetName,
    assertCurrent = () => {},
  } = {}
) {
  assertCurrent();
  requireIdentity(productContext && identity(productContext.datasetName) === identity(datasetName));
  const resolution = await workUnitService.resolveWorkUnit(datasetName, { force: true });
  assertCurrent();
  const signature = packageSignature(resolution, productContext, registry);
  resolution.assertCurrent();
  const results = await Promise.allSettled(
    resolution.memberProducts.map((context) =>
      fetchHistory(context.datasetName, { productContext: context, validateOwnership: true })
    )
  );
  assertCurrent();
  resolution.assertCurrent();
  // Product-level History is not transactional. Re-read mapping evidence after
  // both optional reads so a reassignment cannot publish under an old package.
  const details = await Promise.all(
    resolution.workUnit.members.map((member) => fetchProduct(member.datasetName))
  );
  assertCurrent();
  for (const [index, detail] of details.entries()) {
    requireIdentity(
      detail?.success &&
        identity(detail.data?.datasetName) ===
          identity(resolution.workUnit.members[index].datasetName)
    );
    for (const member of resolution.workUnit.members) {
      requireIdentity(
        identity(detail.data?.workUnitMetadata?.members?.[member.key]?.datasetName) ===
          identity(member.datasetName)
      );
    }
  }
  resolution.assertCurrent();
  requireIdentity(packageSignature(resolution, productContext, registry) === signature);
  return {
    datasetName: resolution.product.datasetName,
    workUnit: resolution.workUnit,
    members: results.map((result, index) => {
      const member = resolution.workUnit.members[index];
      const context = resolution.memberProducts[index];
      try {
        if (result.status === "rejected") throw result.reason;
        validateHistoryIdentity(result.value, context);
        return { ...member, history: result.value, error: null };
      } catch (error) {
        return {
          ...member,
          history: null,
          error: error?.message ?? "Product History could not be loaded.",
        };
      }
    }),
  };
}

function packageSignature(resolution, requested, registry) {
  const unit = resolution?.workUnit;
  const members = unit?.members;
  const contexts = resolution?.memberProducts;
  requireIdentity(
    resolution?.status === "resolved" &&
      unit?.kind === "package" &&
      typeof resolution.assertCurrent === "function" &&
      members?.length === 2 &&
      contexts?.length === 2
  );
  const owner = registry.byId.get(resolution.product?.sourceId);
  const declaration = owner?.workUnit;
  requireIdentity(
    declaration?.kind === "package" &&
      declaration.members?.length === 2 &&
      unit.primaryMemberKey === declaration.primaryMemberKey &&
      members[0].key === unit.primaryMemberKey &&
      unit.identityKey ===
        JSON.stringify(["package", owner.id, identity(members[0].datasetName)]) &&
      contexts[0].identityKey === resolution.product.identityKey &&
      identity(resolution.product.datasetName) === identity(members[0].datasetName) &&
      new Set(members.map((member) => identity(member.datasetName))).size === 2
  );
  const requestedIndex = contexts.findIndex(
    (context) =>
      context.sourceId === requested.sourceId &&
      context.identityKey === requested.identityKey &&
      identity(context.datasetName) === identity(requested.datasetName)
  );
  requireIdentity(
    requestedIndex >= 0 &&
      requested.productType === contexts[requestedIndex].productType &&
      JSON.stringify(requested.workUnit ?? null) ===
        JSON.stringify(registry.byId.get(requested.sourceId)?.workUnit ?? null)
  );
  for (const [index, member] of members.entries()) {
    const context = contexts[index];
    const declared = declaration.members[index];
    const source = registry.byId.get(member.sourceId);
    requireIdentity(
      source &&
        registry.definitions.includes(source) &&
        isWorkspaceAvailableDataSource(source) &&
        source.normalizer?.specification === (index === 0 ? "S101" : "S57") &&
        (index === 0
          ? !source.workspace?.workUnitSourceId || source.workspace.workUnitSourceId === owner.id
          : source.workspace?.workUnitSourceId === owner.id) &&
        member.key === declared.key &&
        member.sourceId === declared.sourceId &&
        member.label === declared.label &&
        member.exportStandard === declared.exportStandard &&
        context.sourceId === source.id &&
        context.productType === source.productType &&
        identity(context.datasetName) === identity(member.datasetName) &&
        context.identityKey === serializeProductIdentity(context) &&
        context.data?.attributes?.sourceId === source.id &&
        context.data.attributes.productSpecification === source.normalizer.specification
    );
  }
  return JSON.stringify([
    unit,
    contexts.map((context) => [context.identityKey, context.datasetName]),
  ]);
}

function validateHistoryIdentity(history, context) {
  requireIdentity(
    history &&
      Array.isArray(history.events) &&
      identity(history.datasetName) === identity(context.datasetName) &&
      (!history.sourceId || history.sourceId === context.sourceId)
  );
  for (const event of history.events) {
    requireIdentity(
      !identity(event.datasetName) || identity(event.datasetName) === identity(context.datasetName)
    );
  }
}

function requireIdentity(condition) {
  if (!condition)
    throw new Error("Package History identity or member mapping is incomplete or contradictory.");
}
