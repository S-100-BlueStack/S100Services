export const MAX_BINDING_COMMENT_LENGTH = 4000;
export const BINDING_COMMENT_PAGE_SIZE = 50;
export const BINDING_COMMENT_AVAILABILITY_LIMIT = 200;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)$/;

// .NET string.Trim uses Unicode White_Space. Match the server before comparing readback.
export function trimBindingComment(text) {
  return text.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
}

export function hasBindingCommentText(value) {
  return (
    typeof value === "string" &&
    value.length <= MAX_BINDING_COMMENT_LENGTH &&
    Boolean(trimBindingComment(value))
  );
}

function isOperationId(value) {
  return typeof value === "string" && value !== EMPTY_GUID && GUID.test(value);
}

function invalidComments() {
  return new Error("API returned invalid binding comments.");
}

export function normalizeBindingComment(item) {
  if (
    !isOperationId(item?.id) ||
    typeof item.pipelineId !== "string" ||
    !item.pipelineId.trim() ||
    !hasBindingCommentText(item.text) ||
    typeof item.actor !== "string" ||
    !item.actor.trim() ||
    typeof item.occurredAtUtc !== "string" ||
    !UTC_TIMESTAMP.test(item.occurredAtUtc) ||
    !Number.isFinite(Date.parse(item.occurredAtUtc))
  ) {
    throw invalidComments();
  }
  const { pipelineId, text, actor, occurredAtUtc } = item;
  return { id: item.id.toLowerCase(), pipelineId, text, actor, occurredAtUtc };
}

export function normalizeBindingCommentPage(value, packageId, before, pipelineId) {
  if (
    value?.packageId !== packageId ||
    (pipelineId !== undefined && value.pipelineId !== pipelineId) ||
    !Array.isArray(value.items) ||
    value.items.length > BINDING_COMMENT_PAGE_SIZE ||
    (value.nextBefore !== null && !isOperationId(value.nextBefore))
  ) {
    throw invalidComments();
  }
  const seen = new Set(before ? [before] : []);
  const items = value.items.map((item) => {
    const comment = normalizeBindingComment(item);
    if (isOperationId(item.historyEventId) && item.historyEventId.toLowerCase() !== comment.id) {
      comment.historyEventId = item.historyEventId.toLowerCase();
    }
    return comment;
  });
  for (const item of items) {
    if (seen.has(item.id) || (pipelineId !== undefined && item.pipelineId !== pipelineId)) {
      throw invalidComments();
    }
    seen.add(item.id);
  }
  const nextBefore = value.nextBefore?.toLowerCase() ?? null;
  if (
    nextBefore &&
    (items.length !== BINDING_COMMENT_PAGE_SIZE || nextBefore !== items.at(-1).id)
  ) {
    throw invalidComments();
  }
  return { items, nextBefore };
}

export function toBindingCommentRequest(draft) {
  if (
    !isOperationId(draft?.id) ||
    typeof draft.workStreamId !== "string" ||
    !draft.workStreamId.trim() ||
    !hasBindingCommentText(draft.text)
  ) {
    throw new Error("A binding comment requires a Workstream, operation ID and valid text.");
  }
  return { pipelineId: draft.workStreamId, operationId: draft.id, text: draft.text };
}

export function bindingCommentKey({ packageId, pipelineId }) {
  return JSON.stringify([packageId, pipelineId]);
}

function validCommentId(id) {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 200 &&
    trimBindingComment(id) === id &&
    !id.includes("::") &&
    !/\p{Cc}/u.test(id)
  );
}

export function validateBindingCommentScope(binding) {
  if (!validCommentId(binding?.packageId) || !validCommentId(binding.pipelineId)) {
    throw new Error("Supply valid Package and Pipeline IDs.");
  }
}

export function validateBindingCommentAvailabilityBindings(bindings) {
  if (
    !Array.isArray(bindings) ||
    bindings.length < 1 ||
    bindings.length > BINDING_COMMENT_AVAILABILITY_LIMIT
  ) {
    throw new Error("Supply 1 to 200 distinct Package–Pipeline bindings.");
  }

  const seen = new Set();
  for (const binding of bindings) {
    validateBindingCommentScope(binding);
    const key = bindingCommentKey(binding);
    if (seen.has(key)) throw new Error("Package–Pipeline bindings must be distinct.");
    seen.add(key);
  }
}

export function normalizeBindingCommentAvailability(value, bindings) {
  const remaining = new Set(bindings.map(bindingCommentKey));
  const presence = new Map();
  if (!Array.isArray(value?.items) || value.items.length !== remaining.size) {
    throw invalidComments();
  }
  for (const row of value.items) {
    if (!row || ![true, false, null].includes(row.hasBindingComments)) {
      throw invalidComments();
    }
    const key = bindingCommentKey(row);
    if (!remaining.delete(key)) throw invalidComments();
    presence.set(key, row.hasBindingComments);
  }
  return presence;
}
