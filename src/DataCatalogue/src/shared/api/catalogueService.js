import { normalizeSeverity } from "../domain/severity.js";

export function requiredId(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("API returned a missing identifier.");
  return value;
}

export function normalizePackage(value) {
  const id = requiredId(value?.id);
  const metadata = value.metaData ?? {};
  return {
    id,
    packageId: id,
    shortId: metadata.shortId ?? null,
    name: metadata.shortId || id,
    sourceId: metadata.refId ?? metadata.shortId ?? id,
    type: metadata.type ?? null,
    category: value.category ?? null,
    title: metadata.title ?? value.fileName ?? id,
    references: metadata.refId ?? null,
    descriptionEntries: Array.isArray(value.descriptions)
      ? value.descriptions.map((entry) => ({
          language: entry.language ?? null,
          description: entry.description ?? "",
        }))
      : [],
    details:
      value.descriptions
        ?.map((item) => [item.language, item.description].filter(Boolean).join(": "))
        .join("\n\n") ?? null,
    nauticalCharts:
      value.charts
        ?.map((item) =>
          [item.chartNumber, item.internationalNumber].filter((part) => part != null).join(" / ")
        )
        .join(", ") ?? null,
    publication: metadata.source ?? null,
    createdAt: value.createdUTC ?? metadata.createdUTC ?? null,
    lastUpdatedUtc: value.lastUpdatedUtc ?? null,
    severity: normalizeSeverity(value.severity),
    geometryRef: value.geometryRef ?? null,
    detailedGeometry: value.detailedGeometry ?? null,
    geometry: null,
  };
}

export function normalizeWorkspace(value, pipelineId, pipelineName = pipelineId) {
  const id = requiredId(value?.id);
  return {
    id,
    workspaceId: id,
    pipelineId: requiredId(pipelineId),
    pipelineName,
    key: JSON.stringify([pipelineId, id]),
    name: value.displayName || id,
    owner: value.owner ?? null,
    lockedAtUtc: value.lockedAtUtc ?? null,
    geometryRef: value.geometryRef ?? null,
    displayScale: value.displayScale ?? null,
  };
}

export function normalizePage(value, map = (item) => item) {
  if (
    !Array.isArray(value?.items) ||
    !Number.isSafeInteger(value.page) ||
    value.page < 1 ||
    !Number.isSafeInteger(value.pageSize) ||
    value.pageSize < 1 ||
    !Number.isSafeInteger(value.totalCount) ||
    value.totalCount < 0 ||
    value.items.length > value.pageSize ||
    value.items.length > value.totalCount
  ) {
    throw new Error("API returned an invalid page envelope.");
  }
  return {
    items: value.items.map(map),
    page: value.page - 1,
    pageSize: value.pageSize,
    total: value.totalCount,
  };
}

function paging({ page = 0, pageSize = 25 } = {}) {
  if (
    !Number.isSafeInteger(page) ||
    page < 0 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200
  ) {
    throw new Error("Page must be zero-based and pageSize must be from 1 to 200.");
  }
  return { page: page + 1, pageSize };
}

export async function collectPages(read, { signal } = {}) {
  const items = [];
  const ids = new Set();
  let expectedTotal;
  for (let page = 0; ; page++) {
    signal?.throwIfAborted();
    const result = await read({ page, pageSize: 200, signal });
    if (result.page !== page || (expectedTotal !== undefined && expectedTotal !== result.total)) {
      throw new Error("Catalogue changed during paging. Reload to obtain a complete list.");
    }
    expectedTotal = result.total;
    for (const item of result.items) {
      const key = item.key ?? item.packageId ?? item.id;
      if (ids.has(key)) throw new Error("Duplicate identity across API pages. Reload the list.");
      ids.add(key);
      items.push(item);
    }
    if (items.length === result.total) return items;
    if (!result.items.length || items.length > result.total)
      throw new Error("API paging did not return a complete list.");
  }
}

export function createCatalogueService(client) {
  const segment = (id) => encodeURIComponent(requiredId(id));
  const workspacePath = (pipelineId, workspaceId) =>
    `/api/v1/pipelines/${segment(pipelineId)}/workspaces/${segment(workspaceId)}`;
  return {
    async packages({ page, pageSize, category, hasPipeline, pipelineId, signal } = {}) {
      return normalizePage(
        await client.request("/api/v1/packages", {
          query: { ...paging({ page, pageSize }), category, hasPipeline, pipelineId },
          signal,
        }),
        normalizePackage
      );
    },
    async package(id, { signal } = {}) {
      const item = normalizePackage(
        await client.request(`/api/v1/packages/${segment(id)}`, { signal })
      );
      if (item.id !== id) throw new Error("API returned a different Package identity.");
      return item;
    },
    async pipelines({ signal } = {}) {
      const page = normalizePage(await client.request("/api/v1/pipelines", { signal }), (item) => ({
        id: requiredId(item.id),
        name: item.displayName || item.id,
        description: item.description ?? null,
        layerIds: [],
      }));
      if (page.page !== 0 || page.items.length !== page.total)
        throw new Error("Pipeline catalogue is incomplete.");
      return page.items;
    },
    async categories({ signal } = {}) {
      const page = normalizePage(await client.request("/api/v1/dispatcher/categories", { signal }));
      if (page.items.length !== page.total) throw new Error("Category catalogue is incomplete.");
      return page.items.map((item) => ({
        id: requiredId(item.id),
        name: item.displayName || item.id,
      }));
    },
    async workspaces({ page, pageSize, pipelineId, owner, unassigned, signal } = {}) {
      return normalizePage(
        await client.request("/api/v1/workspaces", {
          query: { ...paging({ page, pageSize }), pipelineId, owner, unassigned },
          signal,
        }),
        (item) => normalizeWorkspace(item.workspace, item.pipelineId, item.pipelineDisplayName)
      );
    },
    async workspace(pipelineId, workspaceId, { signal } = {}) {
      const value = await client.request(workspacePath(pipelineId, workspaceId), { signal });
      const workspace = normalizeWorkspace(value?.workspace, pipelineId);
      if (workspace.workspaceId !== workspaceId)
        throw new Error("API returned a different Workspace identity.");
      return { workspace, esriJSON: value.esriJSON };
    },
    async workspacePackages(pipelineId, workspaceId, { page, pageSize, signal } = {}) {
      return normalizePage(
        await client.request(`${workspacePath(pipelineId, workspaceId)}/packages`, {
          query: paging({ page, pageSize }),
          signal,
        }),
        (item) => ({ packageId: requiredId(item.packageId), shortId: item.shortId ?? null })
      );
    },
    async bindings(packageId, { signal } = {}) {
      const values = await client.request("/api/v1/dispatcher/bindings", {
        query: { packageId: requiredId(packageId) },
        signal,
      });
      if (!Array.isArray(values)) throw new Error("API returned invalid bindings.");
      const seen = new Set();
      return values.map((item) => {
        const pipelineId = requiredId(item.pipelineId);
        if (item.packageId !== packageId || seen.has(pipelineId) || !Array.isArray(item.workspaces))
          throw new Error("API returned inconsistent Package bindings.");
        seen.add(pipelineId);
        return {
          id: requiredId(item.id),
          packageId,
          pipelineId,
          workspaces: item.workspaces.map((workspace) => normalizeWorkspace(workspace, pipelineId)),
        };
      });
    },
    bind(packageId, pipelineId) {
      return client.request("/api/v1/dispatcher/bindings", {
        method: "POST",
        body: { packageId: requiredId(packageId), pipelineId: requiredId(pipelineId) },
      });
    },
    unbind(bindingId) {
      return client.request(`/api/v1/dispatcher/bindings/${segment(bindingId)}`, {
        method: "DELETE",
      });
    },
  };
}
