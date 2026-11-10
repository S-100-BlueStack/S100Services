import { workspacePreviewSelection } from "../../assignments/domain/workspacePreview.js";

// Only saved Package-Pipeline bindings are authoritative. Workspace selections and
// binding comments stay in the session draft until the API exposes write contracts.
export function createPipelineRow(pipeline, session, { listWorkspaces } = {}) {
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

  const derived = document.createElement("p");
  derived.className = "dc-assignment-muted dc-workspace-preview__summary";
  const editor = document.createElement("section");
  editor.className = "dc-workspace-preview";
  editor.hidden = true;
  editor.setAttribute("aria-label", `Workspaces for ${pipeline.name}`);
  const status = document.createElement("p");
  status.className = "dc-assignment-muted dc-workspace-preview__status";
  status.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "dc-workspace-preview__list";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry Workspaces";
  retry.hidden = true;
  editor.append(status, list, retry);
  element.append(heading, commentEditor, derived, editor);

  let currentPackageId = null;
  let currentState = null;
  let workspaces = null;
  let workspaceRows = [];
  let generation = 0;
  let controller = null;
  let requestPending = false;
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

  function updateControls() {
    const active = isActive();
    const automatic = currentState?.record?.relations?.[pipeline.id]?.workspaces?.length ?? 0;
    checkbox.checked = active;
    checkbox.disabled = !currentState?.feature || currentState.loading || currentState.saving;
    comment.disabled = !canEdit();
    comment.classList.toggle("has-comment", Boolean(draftComment()?.text.trim()));
    if (!canEdit()) closePopup();
    const currentComment = draftComment()?.text ?? "";
    if (document.activeElement !== commentInput) commentInput.value = currentComment;
    commentInput.disabled = !canEdit();
    derived.textContent =
      active && currentState?.record?.relations?.[pipeline.id]
        ? `${automatic} auto-matched workspaces`
        : "";
    editor.hidden = !active;
    for (const row of workspaceRows) {
      const choice = workspacePreviewSelection(
        currentState?.record,
        currentState?.draft,
        pipeline.id,
        row.id
      );
      row.checkbox.checked = choice.selected;
      row.checkbox.disabled = !canEdit();
      row.element.classList.toggle("is-preview-change", choice.selected !== choice.automatic);
    }
  }

  function invalidate() {
    generation++;
    controller?.abort();
    controller = null;
    requestPending = false;
  }

  function renderWorkspaces() {
    workspaceRows = workspaces.map((workspace) => {
      const row = document.createElement("label");
      row.className = "dc-workspace-preview__row";
      const input = document.createElement("input");
      input.type = "checkbox";
      const text = document.createElement("span");
      text.className = "dc-workspace-preview__name";
      text.textContent = workspace.name;
      input.addEventListener("change", () => {
        session.setWorkspacePreview(pipeline.id, workspace.id, input.checked);
      });
      row.append(input, text);
      return { id: workspace.id, element: row, checkbox: input };
    });
    list.replaceChildren(...workspaceRows.map((row) => row.element));
    status.textContent = "";
    updateControls();
  }

  async function loadWorkspaces() {
    if (destroyed || !currentPackageId || !isActive() || requestPending) return;
    invalidate();
    const current = generation;
    const packageId = currentPackageId;
    controller = new AbortController();
    const signal = controller.signal;
    requestPending = true;
    retry.hidden = true;
    status.textContent = "Loading Workspaces…";
    const isCurrent = () =>
      !destroyed &&
      !signal.aborted &&
      current === generation &&
      isActive() &&
      currentPackageId === packageId &&
      session.snapshot().feature?.id === packageId;

    try {
      if (typeof listWorkspaces !== "function")
        throw new Error("Workspace catalogue is unavailable.");
      const result = await listWorkspaces({ pipelineId: pipeline.id, signal });
      if (!isCurrent()) return;
      if (!Array.isArray(result?.items))
        throw new Error("Workspace catalogue returned an invalid result.");
      workspaces = [...result.items].sort((a, b) => a.name.localeCompare(b.name));
      renderWorkspaces();
    } catch (error) {
      if (!isCurrent()) return;
      status.textContent = error.message;
      retry.hidden = false;
    } finally {
      if (current === generation) requestPending = false;
    }
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
  retry.addEventListener("click", () => void loadWorkspaces());

  return {
    element,
    update(state) {
      if (destroyed) return;
      const nextPackageId = state.feature?.id ?? null;
      if (nextPackageId !== currentPackageId) {
        invalidate();
        currentPackageId = nextPackageId;
        workspaces = null;
        workspaceRows = [];
        list.replaceChildren();
        retry.hidden = true;
        status.textContent = "";
        closePopup();
      }
      currentState = state;
      updateControls();
      if (!isActive()) {
        if (requestPending) invalidate();
        retry.hidden = true;
        status.textContent = "";
      }
      if (isActive() && workspaces === null && !requestPending && retry.hidden) {
        void loadWorkspaces();
      }
    },
    destroy() {
      destroyed = true;
      invalidate();
      commentListeners.abort();
      closePopup();
    },
  };
}
