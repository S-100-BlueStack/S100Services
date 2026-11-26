import { bindingCommentKey } from "../../../shared/api/bindingComments.js";
import { createPackageCommentViewerLoader } from "../services/createPackageCommentViewerLoader.js";

const LABELS = {
  present: "View saved comments",
  absent: "No saved comments",
  loading: "Checking comments",
  unknown: "Comment availability unknown",
  error: "Comment availability could not be loaded",
};

const CUES = { loading: "…", unknown: "?", error: "!" };

export function createPackageCommentViewer({
  listElement,
  panelElement,
  headerElement,
  availability,
  read,
  readProfile,
}) {
  const element = document.createElement("section");
  element.id = "data-catalogue-package-comments";
  element.className = "package-comment-viewer";
  element.hidden = true;
  element.setAttribute("popover", "manual");
  element.setAttribute("role", "dialog");

  const heading = document.createElement("h3");
  heading.id = "data-catalogue-package-comments-title";
  element.setAttribute("aria-labelledby", heading.id);
  const header = document.createElement("header");
  const closeButton = action("Close comments", "x");
  header.append(heading, closeButton);

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const scroll = document.createElement("div");
  scroll.className = "package-comment-viewer__scroll";
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", "Saved comments");
  const list = document.createElement("ul");
  scroll.append(list);
  const older = action("Load older");
  const retry = action("Retry");
  const footer = document.createElement("footer");
  footer.append(retry, older);
  element.append(header, status, scroll, footer);

  let anchor = null;
  let resizeObserver = null;
  const viewport = document.defaultView ?? window;
  let names = new Map();
  let renderedEntries = null;
  const renderedRows = new Map();
  const loader = createPackageCommentViewerLoader({
    read,
    readProfile,
    observeFirstPage: availability.observeFirstPage,
    onChange: render,
  });

  older.addEventListener("click", () => void loader.loadOlder());
  retry.addEventListener("click", () => void loader.retry());
  closeButton.addEventListener("click", () => close({ restore: true }));
  function onEscape(event) {
    if (event.key !== "Escape" || !anchor) return;
    event.preventDefault();
    event.stopPropagation();
    close({ restore: true });
  }
  element.addEventListener("keydown", onEscape);
  listElement.addEventListener("keydown", onEscape);

  function buttons() {
    return [...listElement.querySelectorAll('[data-job-focus="comments"]')];
  }

  function bindingOf(button) {
    return {
      packageId: button.dataset.commentPackageId,
      pipelineId: button.dataset.commentPipelineId,
    };
  }

  function workstreamName(button) {
    return names.get(button.dataset.commentPipelineId) || button.dataset.commentPipelineName;
  }

  function syncButtons() {
    for (const button of buttons()) {
      const state = availability.getStatus(bindingOf(button));
      const label = `${LABELS[state]} · ${workstreamName(button)}`;
      button.dataset.availability = state;
      button.title = label;
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", String(button === anchor));
      button.lastElementChild.textContent = CUES[state] ?? "";
    }
  }

  function visibleTrigger(button) {
    if (!listElement.contains(button) || button.closest("details:not([open])")) return null;
    const trigger = button.getBoundingClientRect();
    const panel = panelElement.getBoundingClientRect();
    const headerBottom = headerElement.getBoundingClientRect().bottom;
    if (
      trigger.top < Math.max(panel.top, headerBottom, 0) ||
      trigger.bottom > Math.min(panel.bottom, viewport.innerHeight) ||
      trigger.left < Math.max(panel.left, 0) ||
      trigger.right > Math.min(panel.right, viewport.innerWidth)
    )
      return null;
    return trigger;
  }

  function position() {
    if (!anchor) return;
    const trigger = visibleTrigger(anchor);
    if (!trigger) {
      close({ restore: element.contains(document.activeElement) });
      return;
    }

    const viewportWidth = viewport.innerWidth;
    const viewportHeight = viewport.innerHeight;
    const edge = 8;
    const gap = 4;
    const below = viewportHeight - edge - trigger.bottom - gap;
    const above = trigger.top - gap - edge;
    const scrollTop = scroll.scrollTop;
    element.style.maxHeight = "";
    const openAbove = below < element.offsetHeight && above > below;
    element.style.maxHeight = `${Math.max(0, openAbove ? above : below)}px`;
    const left = Math.max(
      edge,
      Math.min(trigger.right - element.offsetWidth, viewportWidth - edge - element.offsetWidth)
    );
    const top = openAbove ? trigger.top - gap - element.offsetHeight : trigger.bottom + gap;
    element.style.left = `${left}px`;
    element.style.top = `${Math.max(edge, top)}px`;
    if (scroll.scrollTop !== scrollTop) scroll.scrollTop = scrollTop;
  }

  function onViewportScroll(event) {
    if (event.target !== scroll && event.target !== element) position();
  }

  function onOutsidePointer(event) {
    if (
      element.contains(event.target) ||
      (listElement.contains(event.target) && event.target.closest?.('[data-job-focus="comments"]'))
    )
      return;
    close();
  }

  function watchAnchor() {
    resizeObserver?.disconnect();
    if (typeof ResizeObserver !== "function") return;
    resizeObserver = new ResizeObserver(position);
    resizeObserver.observe(anchor);
    resizeObserver.observe(panelElement);
    resizeObserver.observe(headerElement);
  }

  function syncList() {
    if (anchor && !listElement.contains(anchor)) {
      const replacement = buttons().find(
        (button) =>
          button.dataset.commentJobId === anchor.dataset.commentJobId &&
          bindingCommentKey(bindingOf(button)) === bindingCommentKey(bindingOf(anchor))
      );
      if (replacement) {
        anchor = replacement;
        watchAnchor();
      } else {
        close({ restore: element.contains(document.activeElement) });
      }
    }
    position();
    syncButtons();
  }

  function close({ restore = false } = {}) {
    if (!anchor) return;
    const previous = anchor;
    anchor = null;
    document.removeEventListener?.("pointerdown", onOutsidePointer, true);
    viewport.removeEventListener?.("scroll", onViewportScroll, true);
    viewport.removeEventListener?.("resize", position);
    resizeObserver?.disconnect();
    resizeObserver = null;
    element.hidePopover?.();
    loader.select(null);
    element.hidden = true;
    syncButtons();
    if (restore) {
      (visibleTrigger(previous) ? previous : listElement).focus({ preventScroll: true });
    }
  }

  function createButton(job) {
    const button = action("View saved comments", "speech-bubble");
    button.classList.add("job-card__comments");
    button.dataset.jobFocus = "comments";
    button.dataset.commentJobId = job.id;
    button.dataset.commentPackageId = job.packageId;
    button.dataset.commentPipelineId = job.pipelineId;
    button.dataset.commentPipelineName = job.pipelineName || job.pipelineId;
    button.setAttribute("aria-controls", element.id);
    button.setAttribute("aria-haspopup", "dialog");
    const cue = document.createElement("span");
    cue.setAttribute("aria-hidden", "true");
    button.append(cue);
    button.addEventListener("click", () => {
      if (anchor === button) {
        close({ restore: true });
        return;
      }

      const wasOpen = Boolean(anchor);
      anchor = button;
      heading.textContent = `Comments · ${workstreamName(anchor)}`;
      if (!wasOpen) {
        element.hidden = false;
        element.showPopover?.();
        document.addEventListener?.("pointerdown", onOutsidePointer, true);
        viewport.addEventListener?.("scroll", onViewportScroll, true);
        viewport.addEventListener?.("resize", position);
      }
      const binding = bindingOf(button);
      const previousBinding = loader.getSnapshot().binding;
      if (!previousBinding || bindingCommentKey(previousBinding) !== bindingCommentKey(binding)) {
        scroll.scrollTop = 0;
      }
      watchAnchor();
      void loader.select(binding);
      position();
      syncButtons();
      if (anchor) closeButton.focus({ preventScroll: true });
    });
    return button;
  }

  function render(state) {
    status.textContent = state.loading
      ? "Loading comments…"
      : (state.error ?? (state.loaded && !state.entries.length ? "No saved comments." : ""));
    status.hidden = !status.textContent;
    for (const button of [older, retry]) {
      button.setAttribute("aria-disabled", String(state.loading));
    }
    retry.hidden = !state.error && !(state.loading && !retry.hidden);
    older.hidden = !state.nextBefore;
    scroll.hidden = !state.entries.length;
    if (
      (retry.hidden && document.activeElement === retry) ||
      (older.hidden && document.activeElement === older) ||
      (scroll.hidden && document.activeElement === scroll)
    ) {
      closeButton.focus({ preventScroll: true });
    }
    if (renderedEntries === state.entries) {
      position();
      return;
    }
    const ids = new Set(state.entries.map((entry) => entry.id));
    for (const [id, row] of renderedRows) {
      if (ids.has(id)) continue;
      row.element.remove();
      renderedRows.delete(id);
    }
    let previous = null;
    for (const entry of state.entries) {
      let row = renderedRows.get(entry.id);
      if (!row) {
        row = createRow(entry);
        renderedRows.set(entry.id, row);
      }
      const next = previous ? previous.nextElementSibling : list.firstElementChild;
      if (next !== row.element) list.insertBefore(row.element, next);
      previous = row.element;
      row.update(entry);
    }
    renderedEntries = state.entries;
    position();
  }

  return {
    element,
    createButton,
    syncButtons,
    syncList,
    close,
    setPipelineCatalogue(groups) {
      names = new Map(groups.map(({ id, name }) => [id, name]));
      if (anchor) heading.textContent = `Comments · ${workstreamName(anchor)}`;
      syncButtons();
      position();
    },
    destroy() {
      close();
      listElement.removeEventListener("keydown", onEscape);
    },
  };
}

function action(label, iconName) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "package-comment-viewer__action";
  button.title = label;
  button.setAttribute("aria-label", label);
  if (iconName) {
    const icon = document.createElement("calcite-icon");
    icon.icon = iconName;
    icon.scale = "s";
    icon.setAttribute("aria-hidden", "true");
    button.append(icon);
  } else {
    button.textContent = label;
  }
  return button;
}

function createRow(entry) {
  const element = document.createElement("li");
  const time = document.createElement("time");
  time.dateTime = entry.dateTime;
  time.textContent = entry.timeLabel;
  const text = document.createElement("p");
  text.className = "package-comment-viewer__text";
  text.textContent = entry.text;
  const attribution = document.createElement("div");
  attribution.className = "package-comment-viewer__actor";
  const photo = document.createElement("img");
  photo.alt = "";
  photo.hidden = true;
  photo.addEventListener("load", () => {
    photo.hidden = false;
  });
  photo.addEventListener("error", () => {
    photo.hidden = true;
  });
  const actor = document.createElement("span");
  attribution.append(photo, actor);
  element.append(time, text, attribution);
  return {
    element,
    update(item) {
      const displayName = item.profile?.displayName;
      actor.textContent = displayName ? `${displayName} (${item.actor})` : item.actor;
      actor.title = item.actorIdentity;
      const source = item.profile?.photoSrc;
      if (!source) {
        photo.hidden = true;
        photo.removeAttribute("src");
      } else if (photo.getAttribute("src") !== source) {
        photo.hidden = true;
        photo.src = source;
      }
    },
  };
}
