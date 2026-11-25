import {
  MAX_BINDING_COMMENT_LENGTH,
  trimBindingComment,
} from "../../../shared/api/bindingComments.js";
import { historyActorLabel, historyTimeLabel } from "../../../shared/domain/historyPresentation.js";

const VISIBLE_COMMENTS = 20;
const EMPTY_COMMENTS = Object.freeze([]);

// The saved binding owns Workspace membership. Comment reads and draft edits
// belong to the assignment session, independent of the map and its geometry.
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
  comment.title = `Comments for ${pipeline.name}`;
  comment.setAttribute("aria-label", comment.title);
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
  commentEditor.setAttribute("aria-label", `Binding comments for ${pipeline.name}`);
  const commentInput = document.createElement("textarea");
  commentInput.rows = 3;
  commentInput.maxLength = MAX_BINDING_COMMENT_LENGTH;
  commentInput.placeholder = "New comment";
  commentInput.setAttribute("aria-label", `Unsaved comment for ${pipeline.name}`);
  const closeComment = document.createElement("button");
  closeComment.type = "button";
  closeComment.textContent = "OK";
  const status = document.createElement("p");
  status.className = "dc-assignment-muted dc-pipeline-comment__status";
  status.setAttribute("role", "status");
  const history = document.createElement("div");
  history.className = "dc-pipeline-comment__history";
  history.tabIndex = 0;
  history.setAttribute("role", "region");
  history.setAttribute("aria-label", "Saved binding comments, newest first");
  const historyList = document.createElement("ol");
  const loadOlder = document.createElement("button");
  loadOlder.type = "button";
  loadOlder.textContent = "Show older comments";
  history.append(historyList, loadOlder);

  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry comments";
  const draftNotice = document.createElement("p");
  draftNotice.className = "dc-assignment-muted dc-pipeline-comment__status";
  const discard = document.createElement("button");
  discard.type = "button";
  discard.textContent = "Discard draft";
  // Keep the textarea mounted when status, history or draft validation changes.
  commentEditor.append(commentInput, closeComment, draftNotice, discard, status, retry, history);

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
  let renderedHistory = null;
  let visibleCount = VISIBLE_COMMENTS;
  let renderedMatchesKey = null;
  let destroyed = false;
  const commentListeners = new AbortController();

  const isActive = () => Boolean(currentState?.draft?.activeIds.includes(pipeline.id));
  const canEdit = () =>
    isActive() &&
    !currentState.loading &&
    !currentState.saving &&
    !currentState.reconciliationRequired &&
    !draftComment()?.awaitingConfirmation;
  const draftComment = () =>
    currentState?.draft?.comments?.find((item) => item.workStreamId === pipeline.id);

  const savedComments = () => {
    const groups = currentState?.commentHistory?.byPipeline;
    return groups && Object.hasOwn(groups, pipeline.id) ? groups[pipeline.id] : EMPTY_COMMENTS;
  };
  const canOpen = () =>
    currentState?.feature &&
    !currentState.loading &&
    !currentState.saving &&
    (isActive() ||
      draftComment() ||
      savedComments().length ||
      currentState.commentHistory?.error ||
      currentState.commentHistory?.loading);

  function renderHistory() {
    const items = savedComments();
    const readState = currentState?.commentHistory;
    status.textContent = !readState
      ? ""
      : readState.loading
        ? "Loading saved comments…"
        : readState.error
          ? items.length
            ? "Could not reload comments. Showing previously loaded comments."
            : "Could not load saved comments."
          : items.length
            ? ""
            : "No saved comments.";
    status.hidden = !status.textContent;
    retry.hidden = !readState?.error;
    history.hidden = items.length === 0;
    if (renderedHistory === items) return;
    renderedHistory = items;
    historyList.replaceChildren();
    history.scrollTop = 0;
    appendHistory(0, Math.min(visibleCount, items.length));
  }

  function appendHistory(from, to) {
    const items = savedComments();
    const rows = items.slice(from, to).map((item) => {
      const row = document.createElement("li");
      const header = document.createElement("div");
      header.className = "dc-assignment-muted";
      header.title = item.actor;
      const time = document.createElement("time");
      time.dateTime = item.occurredAtUtc;
      time.textContent = historyTimeLabel(item.occurredAtUtc);
      const actor = document.createElement("span");
      actor.textContent = `${historyActorLabel(item.actor)} · `;
      header.append(actor, time);
      const text = document.createElement("p");
      text.className = "dc-pipeline-comment__text";
      text.textContent = item.text;
      row.append(header, text);
      return row;
    });
    historyList.append(...rows);
    loadOlder.hidden = to >= items.length;
    if (loadOlder.hidden && document.activeElement === loadOlder) history.focus?.();
  }

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
    const draft = draftComment();
    comment.disabled = !canOpen();
    comment.classList.toggle(
      "has-comment",
      Boolean(trimBindingComment(draft?.text ?? "") || savedComments().length)
    );
    if (!canOpen()) closePopup();
    const currentComment = draft?.text ?? "";
    if (document.activeElement !== commentInput) commentInput.value = currentComment;
    commentInput.hidden = !isActive() && !draft;
    commentInput.readOnly = !canEdit();
    draftNotice.textContent = draft?.awaitingConfirmation
      ? "Unconfirmed draft. Retry Save with the same text or discard the draft."
      : draft && !isActive()
        ? "Reassign this Workstream to save the draft, or discard it."
        : draft
          ? "Unsaved draft"
          : "";
    draftNotice.hidden = !draftNotice.textContent;
    discard.hidden = !draft;
    discard.disabled = !draft || currentState.saving || currentState.reconciliationRequired;
    if (!commentEditor.hidden) renderHistory();
    renderMatches();
  }

  checkbox.addEventListener("change", () => session.setAssigned(pipeline.id, checkbox.checked));
  comment.addEventListener("click", () => {
    if (!canOpen()) return;
    const opening = commentEditor.hidden;
    commentEditor.hidden = !opening;
    comment.setAttribute("aria-expanded", String(opening));
    if (opening) {
      commentInput.value = draftComment()?.text ?? "";
      renderHistory();
      (canEdit() ? commentInput : closeComment).focus?.({ preventScroll: true });
    }
  });
  commentInput.addEventListener("input", () => {
    if (!canEdit()) return;
    const nextText = commentInput.value;
    let existing = draftComment();
    if (!trimBindingComment(nextText)) {
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
  retry.addEventListener("click", () => {
    closeComment.focus?.({ preventScroll: true });
    void session.refreshComments();
  });
  discard.addEventListener("click", () => {
    const draft = draftComment();
    if (draft && !discard.disabled) {
      closeComment.focus?.({ preventScroll: true });
      session.removeComment(draft.id);
    }
  });
  loadOlder.addEventListener("click", () => {
    const from = visibleCount;
    visibleCount = Math.min(from + VISIBLE_COMMENTS, savedComments().length);
    appendHistory(from, visibleCount);
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
      if (state.feature?.id !== currentState?.feature?.id) {
        closePopup();
        renderedHistory = null;
        visibleCount = VISIBLE_COMMENTS;
      }
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
