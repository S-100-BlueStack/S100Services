// Saved Package-Pipeline bindings own automatic Workspace membership. Only the
// Pipeline checkbox and local comment are editable; Workspace matches are read-only.
export function createPipelineRow(pipeline, session) {
  const element = document.createElement("article");
  element.className = "dc-work-stream-row dc-pipeline-binding-row";
  const heading = document.createElement("div");
  heading.className = "dc-work-stream-row__primary";
  const primary = document.createElement("label");
  primary.className = "dc-work-stream-row__selection";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  const name = document.createElement("strong");
  name.textContent = pipeline.name;
  primary.append(checkbox, name);

  const comment = document.createElement("button");
  comment.type = "button";
  comment.className = "dc-pipeline-comment__trigger";
  comment.title = `Edit comment for ${pipeline.name}`;
  comment.setAttribute("aria-label", `Edit comment for ${pipeline.name}`);
  comment.setAttribute("aria-expanded", "false");
  const icon = document.createElement("calcite-icon");
  icon.icon = "speech-bubble";
  icon.scale = "m";
  icon.setAttribute("aria-hidden", "true");
  comment.append(icon);
  heading.append(primary, comment);

  const commentEditor = document.createElement("div");
  commentEditor.className = "dc-pipeline-comment__popover";
  commentEditor.hidden = true;
  commentEditor.setAttribute("role", "dialog");
  commentEditor.setAttribute("aria-label", `Binding comment for ${pipeline.name}`);
  const commentInput = document.createElement("textarea");
  commentInput.rows = 3;
  commentInput.placeholder = "Comment";
  commentInput.setAttribute("aria-label", `Binding comment for ${pipeline.name}`);
  const closeComment = document.createElement("button");
  closeComment.type = "button";
  closeComment.textContent = "OK";
  commentEditor.append(commentInput, closeComment);

  const matches = document.createElement("section");
  matches.className = "dc-auto-workspaces";
  matches.hidden = true;
  matches.setAttribute("aria-label", `Automatically matched Workspaces for ${pipeline.name}`);
  const matchStatus = document.createElement("p");
  matchStatus.className = "dc-assignment-muted dc-auto-workspaces__status";
  matchStatus.setAttribute("role", "status");
  const matchList = document.createElement("ul");
  matchList.className = "dc-auto-workspaces__list";
  matches.append(matchStatus, matchList);
  element.append(heading, commentEditor, matches);

  let currentState = null;
  let renderedMatchesKey = null;
  let destroyed = false;
  const commentListeners = new AbortController();

  const isActive = () => Boolean(currentState?.draft?.activeIds.includes(pipeline.id));
  const canEdit = () =>
    isActive() &&
    !currentState.loading &&
    !currentState.saving &&
    !currentState.reconciliationRequired;
  const draftComment = () =>
    currentState?.draft?.comments?.find((item) => item.workStreamId === pipeline.id);

  function closePopup({ restoreFocus = false } = {}) {
    if (commentEditor.hidden) return;
    commentEditor.hidden = true;
    comment.setAttribute("aria-expanded", "false");
    if (restoreFocus) comment.focus?.({ preventScroll: true });
  }

  function renderMatches() {
    const active = isActive();
    const saved = currentState?.record?.relations?.[pipeline.id];
    const savedWorkspaces = saved?.active ? saved.workspaces : null;
    const key = JSON.stringify([
      currentState?.feature?.id,
      active,
      saved?.active ?? false,
      Array.isArray(savedWorkspaces)
        ? savedWorkspaces.map((workspace) => [workspace.id, workspace.name])
        : null,
    ]);
    if (key === renderedMatchesKey) return;
    renderedMatchesKey = key;
    matches.hidden = !active;
    matchList.replaceChildren();
    if (!active) {
      matchStatus.textContent = "";
    } else if (!saved?.active) {
      // A new Pipeline draft has no authoritative Workspace membership until Save reconciles.
      matchStatus.textContent = "Workspace matches are calculated after Save.";
    } else if (!Array.isArray(savedWorkspaces)) {
      matchStatus.textContent = "Saved Workspace matches are unavailable.";
    } else {
      const count = savedWorkspaces.length;
      matchStatus.textContent = count
        ? `${count} auto-matched ${count === 1 ? "Workspace" : "Workspaces"}`
        : "No auto-matched Workspaces.";
      const rows = [...savedWorkspaces]
        .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
        .map((workspace) => {
          const row = document.createElement("li");
          row.className = "dc-auto-workspaces__item";
          row.textContent = workspace.name ?? workspace.id;
          return row;
        });
      matchList.replaceChildren(...rows);
    }
  }

  function updateControls() {
    checkbox.checked = isActive();
    checkbox.disabled = !currentState?.feature || currentState.loading || currentState.saving;
    comment.disabled = !canEdit();
    comment.classList.toggle("has-comment", Boolean(draftComment()?.text.trim()));
    if (!canEdit()) closePopup();
    const currentComment = draftComment()?.text ?? "";
    if (document.activeElement !== commentInput) commentInput.value = currentComment;
    commentInput.disabled = !canEdit();
    renderMatches();
  }

  checkbox.addEventListener("change", () => session.setAssigned(pipeline.id, checkbox.checked));
  comment.addEventListener("click", () => {
    if (!canEdit()) return;
    const opening = commentEditor.hidden;
    commentEditor.hidden = !opening;
    comment.setAttribute("aria-expanded", String(opening));
    if (opening) {
      commentInput.value = draftComment()?.text ?? "";
      commentInput.focus?.({ preventScroll: true });
    }
  });
  commentInput.addEventListener("input", () => {
    if (!canEdit()) return;
    const nextText = commentInput.value;
    let existing = draftComment();
    if (!nextText.trim()) {
      if (existing) session.removeComment(existing.id);
      return;
    }
    if (!existing) {
      if (!session.addComment(pipeline.id)) return;
      existing = session
        .snapshot()
        .draft.comments.find((item) => item.workStreamId === pipeline.id);
    }
    if (existing) session.editComment(existing.id, nextText);
  });
  closeComment.addEventListener("click", () => closePopup({ restoreFocus: true }));
  commentEditor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePopup({ restoreFocus: true });
    }
  });
  document.addEventListener?.(
    "pointerdown",
    (event) => {
      if (!commentEditor.hidden && !element.contains?.(event.target)) closePopup();
    },
    { signal: commentListeners.signal }
  );

  return {
    element,
    update(state) {
      if (destroyed) return;
      currentState = state;
      updateControls();
    },
    destroy() {
      destroyed = true;
      commentListeners.abort();
      closePopup();
    },
  };
}
