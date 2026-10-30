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
  let currentIntent = null;
  let queuedIntent = null;
  let acceptedPath = locationRef?.pathname ?? "/";

  function syncJobsButtonState() {
    navbar.jobsButton.disabled = !active && !isJobsStartupComplete();
  }

  function setRoute(path) {
    if (historyRef && locationRef && locationRef.pathname !== path) {
      historyRef.pushState({}, "", path);
    }
    acceptedPath = path;
  }

  function syncNavigation() {
    button.setAttribute("aria-current", active ? "page" : "false");
    home.setAttribute("aria-current", active ? "false" : "page");
  }

  function sameIntent(a, b) {
    return (
      a?.assignment === b.assignment &&
      a?.path === b.path &&
      a?.fromHistory === b.fromHistory &&
      a?.openJobs === b.openJobs
    );
  }

  function commitVisibility(show, openJobs) {
    if (show === active) return;

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
    else if (openJobs && isJobsStartupComplete()) onOpenJobs?.();
  }

  async function applyNavigation(intent, generation) {
    transitioning = true;
    currentIntent = intent;
    const isCurrent = () => alive && generation === navigationGeneration;
    try {
      if (!intent.assignment && active && page) {
        const allowed =
          typeof intent.leaveDecision === "boolean"
            ? intent.leaveDecision
            : await page.allowLeave();
        // Reuse one completed decision if repeated history events still request leaving
        // the same unchanged assignment; do not show a second Save/Discard dialog.
        if (!isCurrent() && queuedIntent && !queuedIntent.intent.assignment) {
          queuedIntent.intent.leaveDecision = allowed;
        }
        if (!isCurrent()) return false;
        if (!allowed) {
          if (intent.fromHistory) historyRef?.replaceState?.({}, "", acceptedPath);
          return false;
        }
      }
      if (!isCurrent()) return false;

      if (intent.assignment && !page) {
        page = createPage({
          onPackageSelected(id) {
            if (alive && active && !transitioning) setRoute(assignmentPath(id));
          },
        });
        shellElement.append(page.element);
      }
      if (!isCurrent()) return false;

      // An already-open workflow should not reset its selected Package on a navbar click.
      if (!intent.fromHistory && intent.assignment === active) {
        if (active && locationRef && locationRef.pathname !== acceptedPath) {
          // A pending popstate changed the address bar, not the accepted workflow.
          historyRef?.replaceState?.({}, "", acceptedPath);
        }
        return intent.assignment;
      }
      if (!intent.fromHistory && !intent.assignment && !active) return false;

      commitVisibility(intent.assignment, intent.openJobs);

      if (intent.fromHistory && intent.assignment && intent.packageId) {
        const selected = await page?.selectPackage?.(intent.packageId, { notify: false });
        if (!isCurrent()) return false;
        if (!selected && page?.hasUnsavedDraft?.()) {
          historyRef?.replaceState?.({}, "", acceptedPath);
          return false;
        }
      }
      if (!isCurrent()) return false;

      if (intent.fromHistory) acceptedPath = intent.path;
      else setRoute(intent.assignment ? assignmentPath() : "/");
      return true;
    } catch (error) {
      if (isCurrent()) {
        onNavigationError(error);
        if (intent.fromHistory) historyRef?.replaceState?.({}, "", acceptedPath);
      }
      return false;
    } finally {
      transitioning = false;
      currentIntent = null;
      const queued = queuedIntent;
      queuedIntent = null;
      if (queued) {
        if (alive) {
          // Only the newest queued navigation may commit after the current await settles.
          void applyNavigation(queued.intent, queued.generation).then(queued.resolve);
        } else {
          queued.resolve(false);
        }
      }
    }
  }

  function navigate(intent) {
    if (!alive) return Promise.resolve(false);
    if (transitioning) {
      if (sameIntent(queuedIntent?.intent ?? currentIntent, intent)) return Promise.resolve(false);
      const generation = ++navigationGeneration;
      queuedIntent?.resolve(false);
      return new Promise((resolve) => {
        queuedIntent = { intent, generation, resolve };
      });
    }
    return applyNavigation(intent, ++navigationGeneration);
  }

  function openFromLocation() {
    const path = locationRef?.pathname ?? "/";
    return navigate({
      ...parseWorkflowPath(path),
      path,
      fromHistory: true,
      openJobs: true,
    });
  }

  function showAssignment(show, openJobs = false) {
    return navigate({
      assignment: show,
      packageId: null,
      path: show ? assignmentPath() : "/",
      fromHistory: false,
      openJobs,
    });
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
      void showAssignment(false, true);
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
    openJobs: () => showAssignment(false, true),
    syncJobsButtonState,
    destroy() {
      alive = false;
      navigationGeneration++;
      queuedIntent?.resolve(false);
      queuedIntent = null;
      abort.abort();
      page?.destroy();
    },
  };
}
