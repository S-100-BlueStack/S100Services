import { CatalogueApiError } from "./catalogueClient.js";
import { normalizePackage } from "./catalogueService.js";
import { UNPRIORITIZED_SEVERITY } from "../domain/severity.js";

const CANONICAL_ID = /^[0-9a-z]{18}$/;
const REJECTION_STATUSES = new Set([400, 401, 403, 404, 409]);

function locationIdentity(location, endpoint) {
  if (!location) return null;
  try {
    const request = new URL(endpoint, globalThis.location?.href);
    const target = new URL(location, request);
    const prefix = `${request.pathname}/`;
    if (target.origin !== request.origin || !target.pathname.startsWith(prefix)) return null;
    const id = target.pathname.slice(prefix.length);
    return CANONICAL_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

function validateCreatedPackage(item, request, id) {
  if (
    !CANONICAL_ID.test(item.id) ||
    (id && id !== item.id) ||
    typeof item.shortId !== "string" ||
    !/^.+-\d{3,}-\d{2}$/.test(item.shortId) ||
    item.category !== request.category ||
    item.severity !== (request.severity ?? UNPRIORITIZED_SEVERITY) ||
    !item.assignmentStatus ||
    !Array.isArray(item.pipelineIds)
  ) {
    throw new Error("API returned incomplete or inconsistent Package confirmation.");
  }
}

export function createManualPackageService({ client, catalogue, timeoutMs = 30_000 }) {
  return {
    async create(request) {
      let status;
      let knownId = null;
      const signal = AbortSignal.timeout(timeoutMs);
      try {
        const raw = await client.postManualPackage(request, {
          signal,
          onResponse(code, location, endpoint) {
            status = code;
            if (code === 201) knownId = locationIdentity(location, endpoint);
          },
        });
        const responseId = typeof raw?.id === "string" && CANONICAL_ID.test(raw.id) ? raw.id : null;
        if (status === 201 && knownId && responseId && knownId !== responseId) {
          // A direct read can establish existence, but cannot resolve a contradictory receipt.
          return {
            status: "unknown",
            knownId: null,
            message: "The API returned conflicting Package identities.",
          };
        }
        signal.throwIfAborted();
        if (status !== 201) throw new Error("Create did not return HTTP 201.");
        knownId ??= raw?.category === request.category ? responseId : null;
        const item = normalizePackage(raw);
        validateCreatedPackage(item, request, knownId);
        return {
          status: "confirmed",
          item: { ...item, sourceReadback: raw.absoluteUri, title: raw.metaData?.title ?? null },
        };
      } catch (error) {
        if (REJECTION_STATUSES.has(status)) {
          return {
            status: "rejected",
            message: error instanceof CatalogueApiError ? error.message : `HTTP ${status}.`,
          };
        }
        return {
          status: "unknown",
          knownId,
          message: signal.aborted ? "The request timed out." : error.message,
        };
      }
    },
    async reconcile(id, request, { signal } = {}) {
      if (!CANONICAL_ID.test(id)) throw new Error("The canonical Package ID is unavailable.");
      const deadline = AbortSignal.timeout(timeoutMs);
      const readSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
      const item = await catalogue.package(id, { signal: readSignal, includeSource: true });
      readSignal.throwIfAborted();
      validateCreatedPackage(item, request, id);
      return item;
    },
  };
}
