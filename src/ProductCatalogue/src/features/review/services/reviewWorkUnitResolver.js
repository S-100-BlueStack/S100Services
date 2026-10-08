import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { reconcileWorkspaceResolutions } from "../../products/domain/workspaceResolutionClaims.js";
import { normalizeReviewProductItems } from "../domain/reviewProductList.js";
import {
  getReviewResolutionAliases,
  getReviewWorkUnitSignature,
} from "../domain/reviewWorkUnits.js";

export async function resolveReviewComposition(
  items,
  {
    retained = [],
    resolve = (name, load) => load(name),
    workspaceWorkUnitService = createWorkspaceWorkUnitService(),
  } = {}
) {
  const normalized = normalizeReviewProductItems(items);
  const aliases = new Map();
  for (const resolution of retained) {
    if (resolution?.status !== "resolved") continue;
    for (const alias of getReviewResolutionAliases(resolution)) aliases.set(alias, resolution);
  }
  const proofs = [];
  for (const item of normalized) {
    let resolution = aliases.get(item.id);
    try {
      if (!resolution) {
        resolution = await resolve(item.datasetName, (name) =>
          workspaceWorkUnitService.resolveWorkUnit(name)
        );
      }
      getReviewWorkUnitSignature(resolution);
      if (resolution.status === "resolved") {
        for (const alias of getReviewResolutionAliases(resolution)) aliases.set(alias, resolution);
      }
      proofs.push({ ...resolution, requestedDatasetName: item.datasetName });
    } catch (error) {
      proofs.push({
        status: "failed",
        requestedDatasetName: item.datasetName,
        product: null,
        error: error.message,
        workUnit: null,
      });
    }
  }
  const resolutions = reconcileWorkspaceResolutions(proofs, { surface: "Review" }).map(
    (resolution) => {
      try {
        // Another input can await a slower provider after this proof completed.
        // Validate its source snapshot again at the canonical composition boundary.
        resolution.assertCurrent?.();
        return resolution;
      } catch (error) {
        return {
          status: "failed",
          requestedDatasetName: resolution.requestedDatasetName,
          product: null,
          workUnit: null,
          error: error.message,
        };
      }
    }
  );
  const canonicalItems = resolutions.map((resolution) => {
    const aliases = new Set(getReviewResolutionAliases(resolution));
    const inputs = normalized.filter((item) => aliases.has(item.id));
    const first = inputs[0];
    return {
      ...first,
      datasetName:
        resolution.status === "resolved"
          ? resolution.product.datasetName
          : resolution.requestedDatasetName,
      enabled: inputs.some((item) => item.enabled),
    };
  });
  return { items: normalizeReviewProductItems(canonicalItems), resolutions };
}
