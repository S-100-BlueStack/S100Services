import {
  isPackageOperationId,
  normalizePackageCommentPage,
  normalizePackageOperation,
  operationText,
  PACKAGE_STATUS_LABELS,
} from "./packageComments.js";
import { normalizeSeverity } from "../domain/severity.js";
import { normalizePackageGeometry } from "./packageGeometry.js";
import { normalizePackageAssignmentSummary } from "./packageAssignmentSummary.js";
import { normalizePackageAoiItem } from "./packageAoiPage.js";
import { normalizePackageHistoryPage, validateHistoryRequest } from "./packageHistory.js";
import { normalizeActorProfile, validateProfileRequest } from "./actorProfile.js";
import {
  BINDING_COMMENT_PAGE_SIZE,
  hasBindingCommentText,
  normalizeBindingComment,
  normalizeBindingCommentAvailability,
  normalizeBindingCommentPage,
  toBindingCommentRequest,
  trimBindingComment,
  validateBindingCommentAvailabilityBindings,
  validateBindingCommentScope,
} from "./bindingComments.js";

export function requiredId(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("API returned a missing identifier.");
  return value;
}

export function normalizePackage(value) {
  const id = requiredId(value?.id);
  const metadata = value.metaData ?? {};
  const assignment = normalizePackageAssignmentSummary(value);
  return {
    id,
    packageId: id,
    ...assignment,
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

const UTC_WORKSPACE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|\+00:00)$/;

function normalizeWorkspaceClaimTime(value) {
  if (typeof value !== "string" || !UTC_WORKSPACE_TIMESTAMP.test(value)) return null;
  const date = new Date(value);
  // Date can silently roll invalid calendar dates into the following month.
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19)
    ? value
    : null;
}

export function normalizeWorkspace(value, pipelineId, pipelineName = pipelineId) {
  const id = requiredId(value?.id);
  const { owner } = value;
  const hasOwner = typeof owner === "string" && owner.trim() && /^[^\p{Cc}]+$/u.test(owner);
  return {
    id,
    workspaceId: id,
    pipelineId: requiredId(pipelineId),
    pipelineName,
    key: JSON.stringify([pipelineId, id]),
    name: value.displayName || id,
    // An absent or malformed owner is unknown. Only explicit null means unassigned.
    owner: owner === null || hasOwner ? owner : undefined,
    lockedAtUtc: hasOwner ? normalizeWorkspaceClaimTime(value.lockedAtUtc) : null,
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

export async function collectPages(read, { signal, initialPage = null } = {}) {
  const items = [];
  const ids = new Set();
  let expectedTotal;
  for (let page = 0; ; page++) {
    signal?.throwIfAborted();
    const result =
      page === 0 && initialPage !== null
        ? initialPage
        : await read({ page, pageSize: 200, signal });
    if (result.page !== page || (expectedTotal !== undefined && expectedTotal !== result.total)) {
      throw new Error("Catalogue changed during paging. Reload to obtain a complete list.");
    }
    if (
      initialPage &&
      (result.pageSize !== initialPage.pageSize ||
        result.items.length !== Math.min(result.pageSize, result.total - page * result.pageSize))
    ) {
      throw new Error("Workspace membership paging returned an incomplete or inconsistent page.");
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
    `/v1/pipelines/${segment(pipelineId)}/workspaces/${segment(workspaceId)}`;
  return {
    async packages({
      page,
      pageSize,
      category,
      hasPipeline,
      pipelineId,
      assignmentStatus,
      signal,
    } = {}) {
      return normalizePage(
        await client.request("/v1/packages", {
          query: {
            ...paging({ page, pageSize }),
            category,
            hasPipeline,
            pipelineId,
            ...(assignmentStatus ? { assignmentStatus } : {}),
          },
          signal,
        }),
        normalizePackage
      );
    },
    async packageGeometries({
      page,
      pageSize = 200,
      category,
      hasPipeline,
      pipelineId,
      signal,
    } = {}) {
      return normalizePage(
        await client.request("/v1/packages/geometry", {
          query: {
            ...paging({ page, pageSize }),
            category,
            hasPipeline,
            pipelineId,
            includeDetails: false,
          },
          signal,
        }),
        normalizePackageAoiItem
      );
    },
    async package(id, { signal } = {}) {
      const item = normalizePackage(
        await client.request(`/v1/packages/${segment(id)}`, { signal })
      );
      if (item.id !== id) throw new Error("API returned a different Package identity.");
      return item;
    },
    async packageComments(id, { pageSize = 50, before = null, signal } = {}) {
      validateHistoryRequest(pageSize, before);
      return normalizePackageCommentPage(
        await client.request(`/v1/packages/${segment(id)}/comments`, {
          query: { pageSize, before },
          signal,
        }),
        id,
        pageSize,
        before
      );
    },
    async savePackageOperation(id, operation, { signal } = {}) {
      const { kind, id: operationId } = operation;
      if (!isPackageOperationId(operationId) || !["discardReason", "reopen"].includes(kind)) {
        throw new Error("Invalid Package operation.");
      }
      if (kind !== "reopen" && !hasBindingCommentText(operation.text)) {
        throw new Error("Supply a new Package comment of 1 to 4000 characters.");
      }
      const text = operationText(operation);
      const result = normalizePackageOperation(
        await client.request(`/v1/packages/${segment(id)}/discarded`, {
          method: "PUT",
          body: { operationId, discarded: kind === "discardReason", reason: text },
          signal,
        })
      );
      if (
        result.id !== operationId.toLowerCase() ||
        result.kind !== kind ||
        result.text !== text ||
        !Object.hasOwn(PACKAGE_STATUS_LABELS, result.assignmentStatus)
      ) {
        throw new Error("API acknowledged a different Package operation.");
      }
      return result;
    },
    async packageHistory(id, { pageSize = 50, before = null, signal } = {}) {
      validateHistoryRequest(pageSize, before);
      return normalizePackageHistoryPage(
        await client.request(`/v1/packages/${segment(id)}/history`, {
          query: { pageSize, before },
          signal,
        }),
        id,
        pageSize,
        before
      );
    },
    async packageHistoryProfile(id, eventId, { actor, signal } = {}) {
      validateProfileRequest(eventId, actor);
      return normalizeActorProfile(
        await client.request(`/v1/packages/${segment(id)}/history/${segment(eventId)}/profile`, {
          signal,
        }),
        actor
      );
    },
    async packageGeometry(id, { signal } = {}) {
      return normalizePackageGeometry(
        await client.request(`/v1/packages/${segment(id)}/geometry`, { signal })
      );
    },
    async pipelines({ signal } = {}) {
      const page = normalizePage(await client.request("/v1/pipelines", { signal }), (item) => ({
        id: requiredId(item.id),
        name: item.displayName || item.id,
        description: item.description ?? null,
        layerIds: [],
      }));
      if (page.page !== 0 || page.items.length !== page.total)
        throw new Error("Workstream catalogue is incomplete.");
      return page.items;
    },
    async categories({ signal } = {}) {
      const page = normalizePage(await client.request("/v1/dispatcher/categories", { signal }));
      if (page.items.length !== page.total) throw new Error("Category catalogue is incomplete.");
      return page.items.map((item) => ({
        id: requiredId(item.id),
        name: item.displayName || item.id,
      }));
    },
    async workspaces({ page, pageSize, pipelineId, owner, unassigned, signal } = {}) {
      return normalizePage(
        await client.request("/v1/workspaces", {
          query: { ...paging({ page, pageSize }), pipelineId, owner, unassigned },
          signal,
        }),
        (item) => normalizeWorkspace(item.workspace, item.pipelineId, item.pipelineDisplayName)
      );
    },
    async workspaceOverview({ pipelineId, page, pageSize = 20, signal } = {}) {
      if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 20)
        throw new Error("Workspace overview pageSize must be from 1 to 20.");
      return normalizePage(
        await client.request(`/v1/pipelines/${segment(pipelineId)}/workspaces/overview`, {
          query: paging({ page, pageSize }),
          signal,
        }),
        (item) => {
          const workspace = normalizeWorkspace(item?.workspace, pipelineId);
          if (item.esriJSON !== null && typeof item.esriJSON !== "string")
            throw new Error("API returned an invalid Workspace overview polygon.");
          if (item.packages !== null && (!item.packages || typeof item.packages !== "object"))
            throw new Error("API returned an invalid Workspace overview membership page.");
          const packages =
            item.packages === null
              ? null
              : normalizePage(item.packages, (member) => ({
                  packageId: requiredId(member?.packageId),
                  shortId: member.shortId ?? null,
                }));
          if (packages && (packages.page !== 0 || packages.pageSize !== 200))
            throw new Error("API returned an invalid first Workspace membership page.");
          return { workspace, esriJSON: item.esriJSON, packages };
        }
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
      const values = await client.request("/v1/dispatcher/bindings", {
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
    async bindingCommentAvailability(bindings, { signal } = {}) {
      validateBindingCommentAvailabilityBindings(bindings);
      const value = await client.request("/v1/packages/binding-comments/availability", {
        method: "POST",
        body: { bindings },
        signal,
      });
      return normalizeBindingCommentAvailability(value, bindings);
    },
    async bindingComments(packageId, { pipelineId, before = null, signal } = {}) {
      if (pipelineId !== undefined) validateBindingCommentScope({ packageId, pipelineId });
      const value = await client.request(`/v1/packages/${segment(packageId)}/binding-comments`, {
        query: {
          pageSize: BINDING_COMMENT_PAGE_SIZE,
          before,
          ...(pipelineId === undefined ? {} : { pipelineId }),
        },
        signal,
      });
      return normalizeBindingCommentPage(value, packageId, before, pipelineId);
    },
    async addBindingComment(packageId, draft, { signal } = {}) {
      const body = toBindingCommentRequest(draft);
      const value = await client.request(`/v1/packages/${segment(packageId)}/binding-comments`, {
        method: "POST",
        body,
        signal,
      });
      const comment = normalizeBindingComment(value);
      if (
        comment.id !== body.operationId.toLowerCase() ||
        comment.pipelineId !== body.pipelineId ||
        comment.text !== trimBindingComment(body.text)
      ) {
        throw new Error("API returned a different binding comment.");
      }
      return comment;
    },
    bind(packageId, pipelineId, { signal } = {}) {
      return client.request("/v1/dispatcher/bindings", {
        method: "POST",
        signal,
        body: { packageId: requiredId(packageId), pipelineId: requiredId(pipelineId) },
      });
    },
    unbind(bindingId, { signal } = {}) {
      return client.request(`/v1/dispatcher/bindings/${segment(bindingId)}`, {
        method: "DELETE",
        signal,
      });
    },
  };
}
