import { directDecisionBlock } from "../../assignments/domain/assignmentDraft.js";
import {
  hasBindingCommentText,
  MAX_BINDING_COMMENT_LENGTH,
} from "../../../shared/api/bindingComments.js";
import { isDirectoryActor } from "../../../shared/api/actorProfile.js";
import {
  historyActorLabel,
  localHistoryTimeLabel,
} from "../../../shared/domain/historyPresentation.js";

function button(label) {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  return control;
}

export function mountPackageCommentControls({
  live,
  firstExistingControl,
  session,
  read,
  readProfile,
  onDecisionSettled,
}) {
  if (!live || typeof read !== "function") return null;
  const controls = createPackageCommentControls({ session, read, readProfile, onDecisionSettled });
  firstExistingControl.before(controls.element);
  return controls;
}

function createPackageCommentControls({
  session,
  read,
  readProfile,
  onDecisionSettled = () => {},
}) {
  const element = document.createElement("div");
  element.className = "dc-package-comment-controls";
  const comments = button("Discard reasons");
  comments.textContent = "";
  comments.className = "dc-pipeline-comment__trigger";
  comments.title = "Discard reasons";
  comments.setAttribute("aria-label", comments.title);
  const icon = document.createElement("calcite-icon");
  icon.setAttribute("icon", "speech-bubble");
  icon.setAttribute("scale", "m");
  icon.setAttribute("aria-hidden", "true");
  comments.append(icon);
  const decision = button("Discard");

  const popup = document.createElement("section");
  popup.id = "data-catalogue-package-assignment-comments";
  popup.className = "dc-pipeline-comment__popover dc-package-comment-popover";
  popup.setAttribute("popover", "manual");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-labelledby", "data-catalogue-package-comment-heading");
  popup.hidden = true;

  for (const trigger of [comments, decision]) {
    trigger.setAttribute("aria-controls", popup.id);
    trigger.setAttribute("aria-expanded", "false");
  }

  const heading = document.createElement("h3");
  heading.tabIndex = -1;
  heading.id = "data-catalogue-package-comment-heading";
  const input = document.createElement("textarea");
  input.rows = 3;
  input.maxLength = MAX_BINDING_COMMENT_LENGTH;
  input.setAttribute("aria-describedby", "data-catalogue-package-comment-status");
  const tools = document.createElement("div");
  tools.className = "dc-package-comment-controls";
  const cancel = button("Cancel");
  const discard = button("Discard");
  tools.append(cancel, discard);
  const status = document.createElement("p");
  status.id = "data-catalogue-package-comment-status";
  status.setAttribute("role", "status");
  const history = document.createElement("div");
  history.className = "dc-pipeline-comment__history";
  history.setAttribute("role", "region");
  history.setAttribute("aria-label", "Saved discard reasons");
  const rows = document.createElement("ol");
  const older = button("Load older");
  const retry = button("Retry");
  history.append(rows, older);
  popup.append(heading, input, tools, status, retry, history);
  element.append(comments, decision, popup);

  let state;
  let submitting = false;
  let decisionError = false;
  let anchor = null;
  let mode = null;
  let operation = null;
  const listeners = new AbortController();
  const viewport = document.defaultView ?? window;
  const listen = (target, event, handler, options = {}) =>
    target.addEventListener(event, handler, { ...options, signal: listeners.signal });

  function position() {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= viewport.innerHeight) {
      if (!submitting && !state.saving) close();
      return;
    }
    const gap = 4;
    const edge = 8;
    const below = viewport.innerHeight - rect.bottom - gap - edge;
    const above = rect.top - gap - edge;
    const scrollTop = popup.scrollTop;
    popup.style.maxHeight = "";
    const placeAbove = below < popup.offsetHeight && above > below;
    popup.style.maxHeight = `${Math.max(0, placeAbove ? above : below)}px`;
    popup.style.left = `${Math.max(edge, Math.min(rect.left, viewport.innerWidth - popup.offsetWidth - edge))}px`;
    popup.style.top = `${placeAbove ? rect.top - popup.offsetHeight - gap : rect.bottom + gap}px`;
    if (mode === "comments") {
      popup.tabIndex = popup.scrollHeight > popup.clientHeight ? 0 : -1;
      popup.scrollTop = scrollTop;
    }
  }

  function close(restore = false) {
    if (!anchor) return;
    const previous = anchor;
    anchor = null;
    mode = null;
    operation?.controller.abort();
    operation = null;
    popup.hidePopover?.();
    popup.hidden = true;
    previous.setAttribute("aria-expanded", "false");
    if (restore && !previous.disabled) previous.focus({ preventScroll: true });
  }

  function renderControls() {
    const reason = mode === "reason";
    heading.textContent = reason ? "Discard Package" : "Discard reasons";
    input.hidden = !reason;
    input.setAttribute("aria-label", "Discard reason");
    input.setAttribute("aria-required", "true");
    input.readOnly = submitting || state.saving || Boolean(state.pendingDecision);
    tools.hidden = !reason;
    cancel.disabled = submitting || state.saving;
    discard.disabled =
      submitting ||
      Boolean(directDecisionBlock(state)) ||
      state.record?.assignmentStatus !== "notAssigned" ||
      !hasBindingCommentText(input.value);
    if (reason)
      status.textContent =
        state.error && (state.pendingDecision || decisionError) ? state.error : "";
  }

  function appendRow(item, current) {
    const row = document.createElement("li");
    const caption = document.createElement("div");
    caption.className = "dc-package-comment-attribution";
    const photo = document.createElement("img");
    photo.alt = "";
    photo.hidden = true;
    function showPhoto(visible) {
      if (operation !== current) return;
      photo.hidden = !visible;
      position();
    }
    photo.addEventListener("load", () => showPhoto(true));
    photo.addEventListener("error", () => showPhoto(false));
    const name = document.createElement("span");
    name.textContent = historyActorLabel(item.actor);
    name.title = item.actor;
    const time = document.createElement("time");
    time.dateTime = item.occurredAtUtc;
    time.textContent = localHistoryTimeLabel(item.occurredAtUtc);
    caption.append(photo, name);
    const text = document.createElement("p");
    text.className = "dc-pipeline-comment__text";
    text.textContent = item.text;
    row.append(time, caption, text);
    rows.append(row);

    if (readProfile && isDirectoryActor(item.actor)) {
      const key = item.actor.toUpperCase();
      let profile = current.profiles.get(key);
      if (!profile) {
        profile = new Promise((resolve) => {
          current.queue.push({ item, resolve });
        });
        current.profiles.set(key, profile);
      }
      void profile.then((value) => {
        if (!value || operation !== current) return;
        if (value.displayName) {
          name.textContent = `${value.displayName} (${historyActorLabel(item.actor)})`;
          position();
        }
        if (value.photoSrc) photo.src = value.photoSrc;
      });
    }
  }

  function startProfiles(current) {
    async function worker() {
      current.running++;
      try {
        while (operation === current && current.queue.length) {
          const { item, resolve } = current.queue.shift();
          let result;
          try {
            result = await readProfile(current.id, item.historyEventId, {
              actor: item.actor,
              signal: current.controller.signal,
            });
          } catch {
            // Recorded account remains available without optional profile enrichment.
          }
          resolve(result);
        }
      } finally {
        current.running--;
      }
    }
    const count = Math.min(current.queue.length, 4 - current.running);
    for (let index = 0; index < count; index++) void worker();
  }

  async function load() {
    const current = operation;
    if (!current || current.pending) return;
    current.pending = true;
    older.setAttribute("aria-disabled", "true");
    if (document.activeElement === retry) heading.focus();
    retry.hidden = true;
    status.textContent = "Loading saved discard reasons…";
    try {
      const page = await read(current.id, {
        before: current.before,
        signal: current.controller.signal,
      });
      if (operation !== current) return;
      if (page.items.some((item) => current.ids.has(item.id))) {
        throw new Error("Discard reasons changed during paging. Close and reopen to reload.");
      }
      for (const item of page.items) {
        current.ids.add(item.id);
        appendRow(item, current);
      }
      current.before = page.nextBefore;
      history.hidden = current.ids.size === 0;
      if (!current.before && document.activeElement === older) {
        heading.focus();
      }
      older.hidden = !current.before;
      status.textContent = current.ids.size ? "" : "No saved discard reasons.";
      startProfiles(current);
    } catch (error) {
      if (operation !== current) return;
      status.textContent = error.message || "Discard reasons could not be loaded.";
      retry.hidden = false;
    } finally {
      if (operation === current) {
        current.pending = false;
        older.setAttribute("aria-disabled", "false");
        position();
      }
    }
  }

  function loadFirst() {
    operation?.controller.abort();
    operation = {
      id: state.feature.id,
      controller: new AbortController(),
      before: null,
      ids: new Set(),
      profiles: new Map(),
      queue: [],
      running: 0,
    };
    rows.replaceChildren();
    if (document.activeElement === older) heading.focus();
    history.hidden = true;
    older.hidden = true;
    void load();
  }

  function open(nextAnchor, nextMode) {
    if (submitting || state.saving) return;
    if (anchor === nextAnchor) {
      close(true);
      return;
    }
    close();
    anchor = nextAnchor;
    mode = nextMode;
    popup.setAttribute("data-mode", mode);
    if (mode === "reason") popup.removeAttribute("tabindex");
    popup.hidden = false;
    popup.showPopover?.();
    if (mode === "comments") popup.scrollTop = 0;
    anchor.setAttribute("aria-expanded", "true");
    input.value = mode === "reason" ? (state.pendingDecision?.text ?? "") : "";
    decisionError = false;
    status.textContent = "";
    retry.hidden = true;
    history.hidden = true;
    renderControls();
    if (mode === "comments") loadFirst();
    position();
    if (anchor) (mode === "reason" ? input : heading).focus({ preventScroll: true });
  }

  async function submit(kind) {
    if (submitting || directDecisionBlock(state)) return;
    submitting = true;
    decisionError = false;
    if (anchor) renderControls();
    try {
      const saved = await session.changePackageDecision(kind, input.value);
      if (listeners.signal.aborted) return;
      if (saved) close(true);
      else decisionError = true;
      onDecisionSettled();
    } finally {
      submitting = false;
      if (anchor && !listeners.signal.aborted) renderControls();
    }
  }

  listen(comments, "click", () => open(comments, "comments"));
  listen(decision, "click", () => {
    if (decision.disabled) return;
    if (state.record.assignmentStatus === "discarded") void submit("reopen");
    else open(decision, "reason");
  });
  listen(input, "input", () => {
    decisionError = false;
    renderControls();
  });
  listen(cancel, "click", () => {
    if (!submitting && !state.saving) close(true);
  });
  listen(discard, "click", () => {
    if (!discard.disabled) void submit("discardReason");
  });
  listen(retry, "click", () => void load());
  listen(older, "click", () => void load());
  listen(popup, "keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (!submitting && !state.saving) close(true);
  });
  listen(
    document,
    "pointerdown",
    (event) => {
      if (anchor && !submitting && !state.saving && !element.contains(event.target)) close();
    },
    { capture: true }
  );
  listen(viewport, "resize", position);
  listen(
    viewport,
    "scroll",
    (event) => {
      if (event.target !== history && event.target !== popup) position();
    },
    { capture: true }
  );

  return {
    element,
    update(next) {
      const previous = state;
      state = next;
      if (state.loading || state.feature?.id !== previous?.feature?.id) close();
      comments.disabled = !state.feature || state.loading || state.saving;
      const kind = state.record?.assignmentStatus === "discarded" ? "reopen" : "discardReason";
      const blocked =
        directDecisionBlock(state) ||
        (state.pendingDecision && state.pendingDecision.kind !== kind
          ? "Check the pending decision."
          : "");
      decision.disabled = Boolean(blocked);
      decision.textContent = kind === "reopen" ? "Reopen" : "Discard";
      const label = kind === "reopen" ? "Reopen Package" : "Discard Package";
      decision.title = blocked || label;
      decision.setAttribute("aria-label", blocked ? `${label}. ${blocked}` : label);
      if (!anchor) return;
      if (
        mode === "reason" &&
        !submitting &&
        previous?.pendingDecision &&
        !state.pendingDecision &&
        state.record?.assignmentStatus === "discarded"
      ) {
        close(true);
        return;
      }
      renderControls();
      if (mode === "comments" && state.packageCommentRevision !== previous?.packageCommentRevision)
        loadFirst();
      position();
    },
    close,
    destroy() {
      close();
      listeners.abort();
    },
  };
}
