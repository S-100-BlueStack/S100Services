const PAGE_SIZE = 200;
export const MAX_OVERVIEW_PACKAGES = 5_000;

// Each backend page is scoped to one active Pipeline binding. Different
// Pipelines can contain the same Package, so the union is by canonical ID.
export async function loadPackageAois(
  catalogue,
  {
    pipelineId,
    pipelineIds,
    signal,
    onProgress = () => {},
    maxPackages = MAX_OVERVIEW_PACKAGES,
  } = {}
) {
  const selected = pipelineIds ?? (pipelineId ? [pipelineId] : []);
  if (
    !Array.isArray(selected) ||
    !selected.length ||
    selected.some((id) => typeof id !== "string" || !id.trim())
  ) {
    throw new Error("Select a Workstream before loading Package AOIs.");
  }
  if (!Number.isSafeInteger(maxPackages) || maxPackages < 1) {
    throw new Error("Package AOI display limit is invalid.");
  }
  const uniquePipelineIds = [...new Set(selected)];
  const itemsByPackage = new Map();
  for (const selectedPipelineId of uniquePipelineIds) {
    let expectedTotal = null;
    const seenInPipeline = new Set();
    let received = 0;
    for (let page = 0; ; page++) {
      signal?.throwIfAborted();
      const result = await catalogue.packageGeometries({
        page,
        pageSize: PAGE_SIZE,
        pipelineId: selectedPipelineId,
        hasPipeline: true,
        signal,
      });
      signal?.throwIfAborted();
      if (
        result.page !== page ||
        !Number.isSafeInteger(result.total) ||
        result.total < 0 ||
        (expectedTotal !== null && result.total !== expectedTotal)
      ) {
        throw new Error("Package AOI catalogue changed during paging. Refresh the layer.");
      }
      if (expectedTotal === null) expectedTotal = result.total;
      if (result.total > maxPackages) {
        throw new Error(`Workstream Package AOI overview exceeds ${maxPackages} features.`);
      }
      for (const item of result.items) {
        if (seenInPipeline.has(item.packageId)) {
          throw new Error("Package AOI catalogue returned duplicate Package identifiers.");
        }
        seenInPipeline.add(item.packageId);
        received++;
        if (!itemsByPackage.has(item.packageId)) itemsByPackage.set(item.packageId, item);
        if (itemsByPackage.size > maxPackages) {
          throw new Error(`Package AOI overview exceeds ${maxPackages} distinct Packages.`);
        }
      }
      if (received > result.total) {
        throw new Error("Package AOI catalogue returned more items than its reported total.");
      }
      onProgress(itemsByPackage.size, result.total);
      if (received === result.total) break;
      if (!result.items.length) {
        throw new Error("Package AOI catalogue returned an incomplete page.");
      }
    }
  }
  return [...itemsByPackage.values()];
}
