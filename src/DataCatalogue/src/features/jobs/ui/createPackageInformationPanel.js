import {
  getLivePackageInformation,
  renderLivePackageInformation,
} from "../../assignmentPage/ui/renderInformationFields.js";
import { JOB_STORE_CHANGE_TYPE } from "../state/jobStore.js";
import { getLiveJobPresentation } from "./liveJobPresentation.js";

// The contextual Details selection and Jobs store already own the metadata read.
// This view owns only disclosure state; it never starts an independent Package request.
export function createPackageInformationPanel({
  onRetry = () => {},
  onVisibilityChange = () => {},
  restoreFocus = () => {},
} = {}) {
  const element = document.createElement("aside");
  element.id = "data-catalogue-package-information";
  element.className = "dc-package-information-panel";
  element.setAttribute("aria-labelledby", "data-catalogue-package-information-title");

  const header = document.createElement("div");
  header.className = "dc-package-information-panel__header";
  const heading = document.createElement("h2");
  heading.id = "data-catalogue-package-information-title";
  heading.className = "dc-package-information-panel__title";
  heading.textContent = "Package information";
  const close = document.createElement("calcite-action");
  close.icon = "x";
  close.text = "Close Package information";
  close.title = close.text;
  header.append(heading, close);

  const scroll = document.createElement("div");
  scroll.className = "dc-package-information-panel__scroll";
  scroll.tabIndex = 0;
  scroll.setAttribute("role", "region");
  scroll.setAttribute("aria-label", "Package metadata");
  const name = document.createElement("h3");
  name.className = "dc-information-panel__name";
  const status = document.createElement("p");
  status.className = "dc-package-information-panel__status";
  status.setAttribute("role", "status");
  const retry = document.createElement("calcite-button");
  retry.className = "dc-package-information-panel__retry";
  retry.textContent = "Retry Packages";
  retry.kind = "neutral";
  retry.appearance = "outline";
  retry.scale = "s";
  retry.hidden = true;
  const content = document.createElement("div");
  content.className = "dc-package-information-panel__fields";
  scroll.append(name, status, retry, content);
  element.append(header, scroll);

  let alive = true;
  let selectedId = null;
  let packageId = null;
  let signature = null;
  let open = false;
  let canRetry = false;
  const abort = new AbortController();

  function syncVisibility() {
    const available = Boolean(selectedId);
    const visible = available && open;
    onVisibilityChange({ available, open: visible });
    // Move focus before hiding an ancestor of the focused control.
    if (!visible && element.contains(document.activeElement)) {
      restoreFocus({ available });
    }
    element.hidden = !visible;
    element.inert = !visible;
    element.setAttribute("aria-hidden", String(!visible));
  }

  function setOpen(next) {
    if (!alive) return;
    open = Boolean(selectedId) && next;
    syncVisibility();
  }

  function update({ selectedJobId, openInformation = false, snapshot }) {
    if (!alive) return;
    const nextId = selectedJobId || null;
    if (nextId !== selectedId) {
      selectedId = nextId;
      open = Boolean(nextId);
    } else if (openInformation && selectedId) {
      open = true;
    }

    // Use only the exact contextual Job, not a different Job with the same Package ID.
    const job = selectedId ? snapshot?.jobs?.find((item) => item.id === selectedId) : null;
    const valid = Boolean(
      job?.source === "live" && typeof job.packageId === "string" && job.packageId.trim()
    );
    const nextPackageId = valid ? job.packageId : null;
    const information = valid
      ? getLivePackageInformation(job, { title: job.packageTitle ?? null })
      : null;
    const nextSignature = information ? JSON.stringify([nextPackageId, information]) : null;
    if (signature !== nextSignature) {
      // Status-only updates must not replace focused description links or reset scrolling.
      if (open && content.contains(document.activeElement)) close.focus({ preventScroll: true });
      if (information) renderLivePackageInformation(content, information);
      else content.replaceChildren();
      signature = nextSignature;
    }
    if (packageId !== nextPackageId) scroll.scrollTop = 0;
    packageId = nextPackageId;
    name.textContent = valid ? getLiveJobPresentation(job).shortId : "";

    const loading = Boolean(selectedId && snapshot?.isLoading);
    const loadFailed = Boolean(
      selectedId &&
      snapshot?.error &&
      (!snapshot.lastChange || snapshot.lastChange.type === JOB_STORE_CHANGE_TYPE.JOBS_LOAD_FAILED)
    );
    let message = "";
    if (selectedId) {
      if (loading) {
        message = valid ? "Refreshing Package information..." : "Loading Package information...";
      } else if (loadFailed) {
        message = valid
          ? "Refresh failed. Showing the last loaded Package information."
          : "Package information could not be loaded.";
      } else if (!valid) {
        message = "Package information is unavailable.";
      }
    }
    if (status.textContent !== message) status.textContent = message;
    canRetry = Boolean(selectedId && !loading && (loadFailed || !valid));
    if (!canRetry && document.activeElement === retry && open) close.focus({ preventScroll: true });
    retry.hidden = !canRetry;
    retry.disabled = !canRetry;
    scroll.setAttribute("aria-busy", String(loading));
    syncVisibility();
  }

  close.addEventListener("click", () => setOpen(false), { signal: abort.signal });
  retry.addEventListener(
    "click",
    () => {
      if (alive && open && canRetry) onRetry();
    },
    { signal: abort.signal }
  );
  element.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape" || !open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    },
    { signal: abort.signal }
  );
  syncVisibility();

  return {
    element,
    update,
    toggle: () => setOpen(!open),
    destroy() {
      alive = false;
      abort.abort();
      selectedId = null;
      open = false;
      canRetry = false;
      element.hidden = true;
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
      content.replaceChildren();
    },
  };
}
