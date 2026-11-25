import {
  hasBindingCommentText,
  MAX_BINDING_COMMENT_LENGTH,
} from "../../../shared/api/bindingComments.js";

export function assignmentStatus(record) {
  return Object.values(record?.relations ?? {}).some((relation) => relation.active)
    ? "Assigned"
    : "Not assigned";
}

export function createDraft(record) {
  return {
    activeIds: Object.keys(record.relations).filter((id) => record.relations[id].active),
    comments: [],
  };
}

// Rebase explicit checkbox edits onto the latest bindings. A comment on an
// externally removed Workstream must never restore the binding by itself.
export function rebaseDraftBindings(currentIds, intendedIds, baselineIds) {
  const baseline = new Set(baselineIds);
  const intended = new Set(intendedIds);
  return [
    ...currentIds.filter((id) => !baseline.has(id) || intended.has(id)),
    ...intendedIds.filter((id) => !baseline.has(id) && !currentIds.includes(id)),
  ];
}

export function isDirty(record, draft) {
  if (!record || !draft) return false;
  const original = createDraft(record).activeIds.sort();
  return (
    JSON.stringify(original) !== JSON.stringify([...draft.activeIds].sort()) ||
    draft.comments.length > 0
  );
}

export function inactiveCommentWorkStreamIds(draft) {
  if (!draft) return [];
  const activeIds = new Set(draft.activeIds);
  return [
    ...new Set(
      draft.comments.map((comment) => comment.workStreamId).filter((id) => !activeIds.has(id))
    ),
  ];
}

export function assignmentDraftError(
  draft,
  { allowComments = true, validateCommentText = false } = {}
) {
  if (!allowComments && draft?.comments.length)
    return "Binding comments are draft-only until the API supports saving them. Clear comments before saving.";
  const workStreamIds = inactiveCommentWorkStreamIds(draft);
  if (workStreamIds.length)
    return `Assign ${workStreamIds.join(", ")} again or remove its unsaved draft comments before saving.`;
  if (
    validateCommentText &&
    draft?.comments.some((comment) => !hasBindingCommentText(comment.text))
  )
    return `Enter a comment between 1 and ${MAX_BINDING_COMMENT_LENGTH} characters.`;
  return "";
}

export function applyDraft(record, draft, { author, createdAt, createId }) {
  const error = assignmentDraftError(draft);
  if (error) throw new Error(error);

  const next = structuredClone(record);
  for (const relation of Object.values(next.relations)) relation.active = false;

  for (const id of draft.activeIds) {
    next.relations[id] ??= { active: false, comments: [] };
    next.relations[id].active = true;
  }

  for (const comment of draft.comments) {
    if (!comment.text.trim()) continue;
    next.relations[comment.workStreamId] ??= { active: false, comments: [] };
    next.relations[comment.workStreamId].comments.push({
      id: createId(),
      text: comment.text.trim(),
      author,
      createdAt,
    });
  }

  return next;
}
