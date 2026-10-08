import { reconcileWorkspaceResolutions } from "../../products/domain/workspaceResolutionClaims.js";
import { normalizeAnalyzeDatasetItems } from "./analyzeDatasetList.js";

const key = (name) =>
  String(name ?? "")
    .trim()
    .toUpperCase();

export function canonicalizeAnalyzeItems(items, products) {
  const aliases = new Map();
  for (const product of products) {
    if (product.workUnit?.kind !== "package") continue;
    for (const member of product.workUnit.members) {
      aliases.set(key(member.datasetName), product.datasetName);
    }
  }
  const result = new Map();
  for (const item of normalizeAnalyzeDatasetItems(items)) {
    const name = aliases.get(key(item.name)) ?? item.name;
    const existing = result.get(key(name));
    if (existing) existing.enabled ||= item.enabled;
    else result.set(key(name), { name, enabled: item.enabled });
  }
  return normalizeAnalyzeDatasetItems([...result.values()]);
}

export function retainAcceptedAnalyzePackages(products, accepted) {
  const previous = new Map(accepted.map((product) => [key(product.datasetName), product]));
  return products.map((product) => {
    const old = previous.get(key(product.datasetName));
    // A failed replacement cannot publish an incomplete member snapshot.
    return old?.members && product.workspaceLoadState === "failed"
      ? { ...old, loadError: product.loadError }
      : product;
  });
}

export function mergeAnalyzeRefresh(current, refreshed, names) {
  const byName = new Map(current.map((product) => [key(product.datasetName), product]));
  for (const product of retainAcceptedAnalyzePackages(refreshed, current)) {
    byName.set(key(product.datasetName), product);
  }
  return names.map((name) => byName.get(key(name))).filter(Boolean);
}

export function reconcileAnalyzeResolutions(resolutions) {
  return reconcileWorkspaceResolutions(resolutions, { surface: "Analyze" });
}
