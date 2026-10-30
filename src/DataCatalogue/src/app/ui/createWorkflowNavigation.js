export function assignmentPath(packageId = null) {
  return packageId == null
    ? "/assignments"
    : `/assignments/packages/${encodeURIComponent(packageId)}`;
}

export function parseWorkflowPath(pathname) {
  if (pathname === "/assignments" || pathname === "/assignments/")
    return { assignment: true, packageId: null };
  const match = /^\/assignments\/packages\/([^/]+)\/?$/.exec(pathname);
  if (match) {
    try {
      return { assignment: true, packageId: decodeURIComponent(match[1]) };
    } catch {
      return { assignment: true, packageId: null };
    }
  }
  return { assignment: false, packageId: null };
}

export function createWorkflowNavigation({
  shellElement,
  jobsWorkflowHost,
  navbar,
  createPage,
  onOpenJobs,
  onNavigationError = () => {},
  isJobsStartupComplete = () => true,
  locationRef = globalThis.location,
  historyRef = globalThis.history,
  windowRef = globalThis.window,
}) {
  const abort = new AbortController();
  const button = navbar.element.querySelector("#feature-assignment-toggle");
  const home = navbar.element.querySelector(".navbar-title-link");
  let page = null;
  let active = false;
  let transitioning = false;
  let alive = true;
  let navigationGeneration = 0;
  let acceptedPath = locationRef?.pathname ?? "/";

  function syncJobsButtonState() {
    navbar.jobsButton.disabled = !active && !isJobsStartupComplete();
  }

  function setRoute(path) {
    if (!historyRef || !locationRef || locationRef.pathname === path) return;
    historyRef.pushState({}, "", path);
    acceptedPath = path;
  }

  function syncNavigation() {
    button.setAttribute("aria-current", active ? "page" : "false");
    home.setAttribute("aria-current", active ? "false" : "page");
  }

  async function showAssignment(show, afterShow, { updateHistory = true } = {}) {
    if (!alive || transitioning || (show === active && !show)) return false;
    if (show === active) return true;
    transitioning = true;
    try {
      if (!show && page && !(await page.allowLeave())) return false;
      if (!alive) return false;

      if (show && !page) {
        page = createPage({
          onPackageSelected(id) {
            if (alive && active) setRoute(assignmentPath(id));
          },
        });
        shellElement.append(page.element);
      }

      // Move keyboard focus before hiding the currently active workflow.
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
      syncNavigation();
      if (show) page.activate();
      else if (isJobsStartupComplete()) afterShow?.();
      if (updateHistory) setRoute(show ? assignmentPath() : "/");
      return true;
    } catch (error) {
      onNavigationError(error);
      return false;
    } finally {
      transitioning = false;
    }
  }

  async function openFromLocation() {
    if (!alive) return;
    const current = ++navigationGeneration;
    const desiredPath = locationRef?.pathname ?? "/";
    const route = parseWorkflowPath(desiredPath);
    if (route.assignment) {
      const shown = await showAssignment(true, undefined, { updateHistory: false });
      if (!alive || current !== navigationGeneration) return;
      if (!shown) {
        historyRef?.replaceState?.({}, "", acceptedPath);
        return;
      }
      if (route.packageId) {
        const selected = await page?.selectPackage?.(route.packageId, { notify: false });
        if (!alive || current !== navigationGeneration) return;
        if (!selected && page?.hasUnsavedDraft?.()) {
          historyRef?.replaceState?.({}, "", acceptedPath);
          return;
        }
      }
      acceptedPath = desiredPath;
      return;
    }
    const shown = active ? await showAssignment(false, onOpenJobs, { updateHistory: false }) : true;
    if (!alive || current !== navigationGeneration) return;
    if (!shown) historyRef?.replaceState?.({}, "", acceptedPath);
    else acceptedPath = desiredPath;
  }

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      void showAssignment(true);
    },
    { signal: abort.signal }
  );
  home.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      void showAssignment(false);
    },
    { signal: abort.signal }
  );

  // Capture prevents the Jobs toggle from mutating map state during a draft decision.
  navbar.jobsButton.addEventListener(
    "click",
    (event) => {
      if (!active) return;
      event.stopImmediatePropagation();
      void showAssignment(false, onOpenJobs);
    },
    { capture: true, signal: abort.signal }
  );

  windowRef?.addEventListener?.("popstate", () => void openFromLocation(), {
    signal: abort.signal,
  });
  syncNavigation();
  if (parseWorkflowPath(locationRef?.pathname ?? "/").assignment) void openFromLocation();

  return {
    openAssignment: () => showAssignment(true),
    openJobs: () => showAssignment(false, onOpenJobs),
    syncJobsButtonState,
    destroy() {
      alive = false;
      navigationGeneration++;
      abort.abort();
      page?.destroy();
    },
  };
}
