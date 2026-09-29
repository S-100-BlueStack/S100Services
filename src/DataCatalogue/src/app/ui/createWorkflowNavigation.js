export function createWorkflowNavigation({
  shellElement,
  jobsWorkflowHost,
  navbar,
  createPage,
  onOpenJobs,
  isJobsStartupComplete = () => true,
}) {
  const abort = new AbortController();
  const button = navbar.element.querySelector("#feature-assignment-toggle");
  const home = navbar.element.querySelector(".navbar-title-link");
  let page = null;
  let active = false;
  let transitioning = false;
  let alive = true;

  function syncJobsButtonState() {
    navbar.jobsButton.disabled = !active && !isJobsStartupComplete();
  }

  async function showAssignment(show, afterShow) {
    if (!alive || transitioning || show === active) return false;
    transitioning = true;

    try {
      if (!show && page && !(await page.allowLeave())) return false;
      if (!alive) return false;

      if (show && !page) {
        page = createPage();
        shellElement.append(page.element);
      }

      // Keep focus outside the subtree before it becomes hidden.
      (show ? button : home).focus({ preventScroll: true });
      active = show;
      jobsWorkflowHost.hidden = show;
      syncJobsButtonState();
      if (page) page.element.hidden = !show;
      navbar.filtersPopover.open = false;
      navbar.filtersPopover.removeAttribute("open");
      navbar.filtersButton.active = false;
      navbar.filtersButton.removeAttribute("active");
      navbar.filtersButton.setAttribute("aria-expanded", "false");
      navbar.filtersButton.hidden = show;
      navbar.element.querySelector("#last-updated").hidden = show;
      button.setAttribute("aria-pressed", String(show));
      if (show) page.activate();
      else if (isJobsStartupComplete()) afterShow?.();
      return true;
    } finally {
      transitioning = false;
    }
  }

  button.addEventListener("click", () => void showAssignment(true), {
    signal: abort.signal,
  });
  home.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      void showAssignment(false);
    },
    { signal: abort.signal }
  );

  // Capture prevents the existing Jobs toggle from mutating map state while a draft decision is open.
  navbar.jobsButton.addEventListener(
    "click",
    (event) => {
      if (!active) return;
      event.stopImmediatePropagation();
      void showAssignment(false, onOpenJobs);
    },
    { capture: true, signal: abort.signal }
  );

  return {
    openAssignment: () => showAssignment(true),
    openJobs: () => showAssignment(false, onOpenJobs),
    syncJobsButtonState,
    destroy() {
      alive = false;
      abort.abort();
      page?.destroy();
    },
  };
}
