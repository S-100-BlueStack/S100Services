import {
  assignmentPath,
  creatorPath,
  getApplicationBasePath,
  parseWorkflowPath,
} from "../../shared/navigation/workflowRoutes.js";

export {
  assignmentPath,
  creatorPath,
  parseWorkflowPath,
} from "../../shared/navigation/workflowRoutes.js";

export function createWorkflowNavigation({
  shellElement,
  jobsWorkflowHost,
  navbar,
  createPage,
  createCreator,
  onOpenJobs,
  onLeaveMainMap,
  onReturnMainMap,
  onNavigationError = () => {},
  isJobsStartupComplete = () => true,
  locationRef = globalThis.location,
  historyRef = globalThis.history,
  windowRef = globalThis.window,
  documentRef = globalThis.document,
}) {
  const abort = new AbortController();
  const button = navbar.element.querySelector("#feature-assignment-toggle");
  const home = navbar.element.querySelector(".navbar-title-link");
  const creatorButton = navbar.element.querySelector("#package-creator-toggle");
  let page = null;
  let creator = null;
  let active = "main";
  let transitioning = false;
  let alive = true;
  let navigationGeneration = 0;
  let currentIntent = null;
  let queuedIntent = null;
  let acceptedPath = locationRef?.pathname ?? "/";
  const basePath = getApplicationBasePath(acceptedPath);

  home.setAttribute("href", basePath);
  button.setAttribute("href", assignmentPath(null, basePath));
  if (creatorButton && createCreator) {
    creatorButton.hidden = false;
    creatorButton.setAttribute("href", creatorPath(basePath));
  }

  function syncJobsButtonState() {
    navbar.jobsButton.disabled = active === "main" && !isJobsStartupComplete();
  }

  function setRoute(path) {
    if (historyRef && locationRef && locationRef.pathname !== path) {
      historyRef.pushState({}, "", path);
    }
    acceptedPath = path;
  }

  function syncDocumentTitle() {
    if (!documentRef) return;
    if (active === "main") {
      documentRef.title = "Data Catalogue";
      return;
    }
    if (active === "creator") {
      documentRef.title = "Package Creator";
      return;
    }
    const route = parseWorkflowPath(acceptedPath, basePath);
    const shortId = page?.getSelectedPackageShortId?.(route.packageId);
    documentRef.title = shortId ? `Package assignment: ${shortId}` : "Package assignment";
  }

  function syncNavigation() {
    button.setAttribute("aria-current", active === "assignment" ? "page" : "false");
    creatorButton?.setAttribute("aria-current", active === "creator" ? "page" : "false");
    home.setAttribute("aria-current", active === "main" ? "page" : "false");
    syncDocumentTitle();
  }

  function sameIntent(a, b) {
    return (
      a?.workflow === b.workflow &&
      a?.path === b.path &&
      a?.fromHistory === b.fromHistory &&
      a?.openJobs === b.openJobs
    );
  }

  function commitVisibility(next, openJobs) {
    if (next === active) return;

    // Relocate focus only when its current host is about to become hidden.
    const previous = active;
    const leavingPage = previous === "assignment" ? page : creator;
    const hiddenHost = previous === "main" ? jobsWorkflowHost : leavingPage?.element;
    const targetButton = next === "assignment" ? button : next === "creator" ? creatorButton : home;
    if (hiddenHost?.contains?.(documentRef?.activeElement)) {
      (targetButton ?? home).focus({ preventScroll: true });
    }

    active = next;
    const outsideMain = next !== "main";
    jobsWorkflowHost.hidden = outsideMain;
    syncJobsButtonState();
    if (page) page.element.hidden = next !== "assignment";
    if (creator) creator.element.hidden = next !== "creator";
    navbar.filtersPopover.open = false;
    navbar.filtersPopover.removeAttribute("open");
    navbar.filtersButton.active = false;
    navbar.filtersButton.removeAttribute("active");
    navbar.filtersButton.setAttribute("aria-expanded", "false");
    navbar.filtersButton.hidden = outsideMain;
    navbar.element.querySelector("#last-updated").hidden = outsideMain;
    syncNavigation();

    if (previous === "main") onLeaveMainMap?.();
    else leavingPage?.deactivate?.();
    if (next === "assignment") page.activate();
    else if (next === "creator") creator.activate();
    else {
      // A return refresh can start before Packages considers its panel-open reuse policy.
      const willOpenJobs = openJobs && isJobsStartupComplete();
      onReturnMainMap?.({ openJobs: willOpenJobs });
      if (willOpenJobs) onOpenJobs?.();
    }
  }

  async function applyNavigation(intent, generation) {
    transitioning = true;
    currentIntent = intent;
    const isCurrent = () => alive && generation === navigationGeneration;
    try {
      const leavingPage = active === "assignment" ? page : active === "creator" ? creator : null;
      if (active !== intent.workflow && leavingPage) {
        const allowed =
          typeof intent.leaveDecision === "boolean"
            ? intent.leaveDecision
            : await leavingPage.allowLeave();
        // Reuse one completed decision if repeated history events still request leaving
        // the same unchanged workflow; do not show a second Save/Discard dialog.
        if (!isCurrent() && queuedIntent && queuedIntent.intent.workflow !== active) {
          queuedIntent.intent.leaveDecision = allowed;
        }
        if (!isCurrent()) return false;
        if (!allowed) {
          if (intent.fromHistory) historyRef?.replaceState?.({}, "", acceptedPath);
          return false;
        }
      }
      if (!isCurrent()) return false;

      if (intent.workflow === "assignment" && !page) {
        page = createPage({
          onPackageSelected(id) {
            if (alive && active === "assignment" && !transitioning) {
              setRoute(assignmentPath(id, basePath));
              syncDocumentTitle();
            }
          },
        });
        shellElement.append(page.element);
      }
      if (intent.workflow === "creator" && !creator) {
        creator = createCreator();
        shellElement.append(creator.element);
      }
      if (!isCurrent()) return false;

      // An already-open workflow should not reset its selected Package on a navbar click.
      if (!intent.fromHistory && intent.workflow === active) {
        if (active !== "main" && locationRef && locationRef.pathname !== acceptedPath) {
          // A pending popstate changed the address bar, not the accepted workflow.
          historyRef?.replaceState?.({}, "", acceptedPath);
        }
        return active !== "main";
      }
      commitVisibility(intent.workflow, intent.openJobs);

      if (intent.fromHistory && intent.workflow === "assignment" && intent.packageId) {
        const selected = await page?.selectPackage?.(intent.packageId, { notify: false });
        if (!isCurrent()) return false;
        if (!selected && page?.hasUnsavedDraft?.()) {
          historyRef?.replaceState?.({}, "", acceptedPath);
          return false;
        }
      }
      if (!isCurrent()) return false;

      if (intent.fromHistory) acceptedPath = intent.path;
      else setRoute(intent.path);
      syncDocumentTitle();
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
    const route = parseWorkflowPath(path, basePath);
    return navigate({
      workflow:
        route.creator && createCreator ? "creator" : route.assignment ? "assignment" : "main",
      packageId: route.packageId,
      path,
      fromHistory: true,
      openJobs: true,
    });
  }

  function showAssignment(show, openJobs = false) {
    return navigate({
      workflow: show ? "assignment" : "main",
      packageId: null,
      path: show ? assignmentPath(null, basePath) : basePath,
      fromHistory: false,
      openJobs,
    });
  }

  function showCreator() {
    if (!createCreator) return Promise.resolve(false);
    return navigate({
      workflow: "creator",
      packageId: null,
      path: creatorPath(basePath),
      fromHistory: false,
      openJobs: false,
    });
  }

  if (createCreator) {
    creatorButton?.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        void showCreator();
      },
      { signal: abort.signal }
    );
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
      if (active === "main") return;
      event.stopImmediatePropagation();
      void showAssignment(false, true);
    },
    { capture: true, signal: abort.signal }
  );

  windowRef?.addEventListener?.("popstate", () => void openFromLocation(), {
    signal: abort.signal,
  });
  syncNavigation();
  const initialRoute = parseWorkflowPath(acceptedPath, basePath);
  if (initialRoute.assignment || (initialRoute.creator && createCreator)) void openFromLocation();

  return {
    openCreator: showCreator,
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
      creator?.destroy();
    },
  };
}
