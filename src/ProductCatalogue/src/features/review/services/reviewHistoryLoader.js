import { fetchProductArtifacts } from "../../data/api/productArtifactApi.js";
import { fetchProductPropertiesByDatasetName } from "../../data/api/productApi.js";
import { fetchProductHistory } from "../../timeline/api/productHistoryApi.js";
import { getDefaultWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { selectPackageValidationArtifacts } from "../../products/domain/packageValidationArtifacts.js";
import { resolveReviewComposition } from "./reviewWorkUnitResolver.js";
import { getReviewWorkUnitSignature, reviewDatasetKey } from "../domain/reviewWorkUnits.js";

export const REVIEW_PRODUCT_LOAD_STATE = Object.freeze({
  LOADED: "loaded",
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
});

export async function loadReviewHistories(
  datasetNames,
  {
    workspaceProductService = getDefaultWorkspaceProductService(),
    workspaceWorkUnitService = createWorkspaceWorkUnitService({
      productService: workspaceProductService,
    }),
    resolutions = null,
    fetchHistory = fetchProductHistory,
    fetchArtifacts = fetchProductArtifacts,
    fetchProduct = fetchProductPropertiesByDatasetName,
  } = {}
) {
  const resolved =
    resolutions ??
    (await resolveReviewComposition(datasetNames, { workspaceWorkUnitService })).resolutions;
  return Promise.all(
    resolved.map(async (resolution) => {
      const name = resolution.product?.datasetName ?? resolution.requestedDatasetName;
      try {
        if (resolution.status !== "resolved") {
          throw new Error(
            resolution.error ?? `Product ${name} could not be resolved for Product Review.`
          );
        }
        const options = { workspaceProductService, fetchHistory, fetchArtifacts };
        if (resolution.workUnit?.kind !== "package") {
          return loadMember(resolution.product, options);
        }
        const signature = getReviewWorkUnitSignature(resolution);
        resolution.assertCurrent?.();
        // Read current member metadata after optional work and freshness priming.
        // A mapping changed while History/artifacts were pending must fail before
        // publication rather than authorize a payload through its earlier proof.
        const members = await Promise.all(
          resolution.workUnit.members.map(async (member, index) => {
            const context = resolution.memberProducts[index];
            const product = await loadMember(context, { ...options, packageMember: true });
            const detail = await fetchProduct(member.datasetName);
            if (
              !detail?.success ||
              reviewDatasetKey(detail.data?.datasetName) !== reviewDatasetKey(member.datasetName)
            ) {
              throw new Error(
                detail?.errorMessage ??
                  "Review package member metadata is unavailable or contradictory."
              );
            }
            for (const expected of resolution.workUnit.members) {
              if (
                reviewDatasetKey(
                  detail.data.workUnitMetadata?.members?.[expected.key]?.datasetName
                ) !== reviewDatasetKey(expected.datasetName)
              ) {
                throw new Error("Review package member mapping changed during loading.");
              }
            }
            const attributes = context.data.attributes;
            return {
              ...product,
              memberKey: member.key,
              memberLabel: member.label,
              status: detail.data.status ?? attributes.status ?? null,
              edition: detail.data.edition ?? attributes.edition ?? null,
              update: detail.data.update ?? attributes.update ?? null,
              issueDate: detail.data.issueDate ?? attributes.issueDate ?? null,
              usageBand: detail.data.usageBand ?? attributes.usageBand ?? null,
              productSpecification: attributes.productSpecification,
            };
          })
        );
        resolution.assertCurrent?.();
        if (getReviewWorkUnitSignature(resolution) !== signature) {
          throw new Error("Review package identity changed during loading.");
        }
        return {
          datasetName: resolution.product.datasetName,
          productContext: resolution.product,
          sourceId: resolution.product.sourceId,
          workUnit: resolution.workUnit,
          workUnitSignature: signature,
          members,
          loadState: REVIEW_PRODUCT_LOAD_STATE.LOADED,
        };
      } catch (error) {
        return {
          datasetName: name,
          sourceId: null,
          productContext: null,
          loadState: REVIEW_PRODUCT_LOAD_STATE.FAILED,
          history: null,
          error: error instanceof Error ? error.message : "Unknown history error.",
          resolutionFailed: true,
        };
      }
    })
  );
}

async function loadMember(
  productContext,
  { workspaceProductService, fetchHistory, fetchArtifacts, packageMember = false }
) {
  const datasetName = productContext.datasetName;
  const [historyResult, artifactResult] = await Promise.allSettled([
    fetchHistory(datasetName, { productContext, workspaceProductService }),
    fetchArtifacts(datasetName, { productContext }),
  ]);
  const history = historyResult.status === "fulfilled" ? historyResult.value : null;
  const error =
    historyResult.status === "rejected"
      ? (historyResult.reason?.message ?? "Product History could not be loaded.")
      : null;
  let validationArtifacts = [];
  let artifactError = null;
  let artifactWarning = null;
  try {
    if (artifactResult.status === "rejected") throw artifactResult.reason;
    const selection = packageMember
      ? selectPackageValidationArtifacts(artifactResult.value, productContext)
      : { artifacts: artifactResult.value, hasUnattributedArtifacts: false };
    validationArtifacts = selection.artifacts;
    if (selection.hasUnattributedArtifacts) {
      artifactWarning =
        "Some validation artifacts have ambiguous or missing Product ownership and were not displayed.";
    }
  } catch (failure) {
    artifactError = failure?.message ?? "Validation files could not be loaded.";
  }
  return {
    validationArtifacts,
    artifactError,
    artifactWarning,
    datasetName,
    sourceId: productContext.sourceId,
    sourceLabel: productContext.sourceLabel,
    productType: productContext.productType,
    productContext,
    loadState: error
      ? REVIEW_PRODUCT_LOAD_STATE.FAILED
      : history?.endpointAvailable
        ? REVIEW_PRODUCT_LOAD_STATE.LOADED
        : REVIEW_PRODUCT_LOAD_STATE.UNAVAILABLE,
    history,
    error,
  };
}
