// The Package list is a bounded metadata optimization, not a replacement for
// authoritative Workspace membership or for targeted reads in large catalogues.
const BULK_MIN_MEMBERS = 12;
const BULK_MAX_ITEMS = 200;
const BULK_MAX_OVERFETCH = 4;
const TARGETED_READ_CONCURRENCY = 6;

export async function loadLivePackageMetadata(catalogue, packageIds, { signal } = {}) {
  const ids = [...new Set(packageIds)];
  if (!ids.length) return new Map();
  signal?.throwIfAborted();

  if (
    ids.length >= BULK_MIN_MEMBERS &&
    ids.length <= BULK_MAX_ITEMS &&
    typeof catalogue.packages === "function"
  ) {
    // A one-item probe avoids downloading hundreds of unrelated descriptions
    // when the current catalogue cannot be efficiently covered by one page.
    const probe = await catalogue.packages({
      page: 0,
      pageSize: 1,
      hasPipeline: true,
      signal,
    });
    signal?.throwIfAborted();
    if (probe.page !== 0 || probe.items.length !== Math.min(probe.total, 1)) {
      throw new Error("Package summary paging returned an inconsistent first page.");
    }

    const maxItems = Math.min(BULK_MAX_ITEMS, ids.length * BULK_MAX_OVERFETCH);
    if (probe.total >= ids.length && probe.total <= maxItems) {
      const page = await catalogue.packages({
        page: 0,
        pageSize: probe.total,
        hasPipeline: true,
        signal,
      });
      signal?.throwIfAborted();
      if (page.page !== 0 || page.total !== probe.total || page.items.length !== page.total) {
        // Concurrent catalogue changes must not publish a partially joined view.
        return loadTargetedPackages(catalogue, ids, signal);
      }
      const listed = new Map();
      for (const item of page.items) {
        if (!item?.id || listed.has(item.id)) {
          throw new Error("Package summary list returned an invalid or duplicate identifier.");
        }
        listed.set(item.id, item);
      }
      if (ids.every((id) => listed.has(id))) {
        return new Map(ids.map((id) => [id, listed.get(id)]));
      }
      // The subscription projection may lag Workspace membership; do not mix
      // partial projection data and targeted Package detail reads.
    }
  }
  return loadTargetedPackages(catalogue, ids, signal);
}

async function loadTargetedPackages(catalogue, ids, signal) {
  const packages = new Map();
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(TARGETED_READ_CONCURRENCY, ids.length) }, async () => {
      while (index < ids.length) {
        signal?.throwIfAborted();
        const id = ids[index++];
        const item = await catalogue.package(id, { signal });
        signal?.throwIfAborted();
        if (item?.id !== id) {
          throw new Error("Package identity does not match the Workspace member.");
        }
        packages.set(id, item);
      }
    })
  );
  signal?.throwIfAborted();
  return packages;
}
