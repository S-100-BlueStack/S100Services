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

export function assignmentDraftError(draft) {
  const workStreamIds = inactiveCommentWorkStreamIds(draft);
  if (!workStreamIds.length) return "";
  return `Assign ${workStreamIds.join(", ")} again or remove its unsaved draft comments before saving.`;
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
