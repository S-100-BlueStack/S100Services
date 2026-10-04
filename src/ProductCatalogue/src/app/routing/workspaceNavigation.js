import { getCurrentRoute } from "./appRoute.js";

export const workspaceNavigationModes = Object.freeze({
  sameTab: "same-tab",
  newTab: "new-tab",
});

const WORKSPACE_ROUTE_NAMES = new Set(["dashboard", "analyze", "review"]);

export function resolveWorkspaceNavigationMode(currentRoute, destinationRoute) {
  const currentRouteName = String(currentRoute?.name ?? "").toLowerCase();
  const destinationRouteName = String(destinationRoute ?? "").toLowerCase();

  return currentRouteName === "main" && WORKSPACE_ROUTE_NAMES.has(destinationRouteName)
    ? workspaceNavigationModes.newTab
    : workspaceNavigationModes.sameTab;
}

export function applyWorkspaceLinkNavigation(link, currentRoute, destinationRoute) {
  const mode = resolveWorkspaceNavigationMode(currentRoute, destinationRoute);

  if (mode === workspaceNavigationModes.newTab) {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  } else {
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }

  return mode;
}

export function launchWorkspaceUrl(
  url,
  destinationRoute,
  {
    currentRoute = getCurrentRoute(),
    openWindow = (destination, target) => window.open(destination, target),
    navigateSameTab = (destination) => window.location.assign(destination),
  } = {}
) {
  const mode = resolveWorkspaceNavigationMode(currentRoute, destinationRoute);

  try {
    if (mode === workspaceNavigationModes.sameTab) {
      navigateSameTab(url);
      return { mode, opened: true };
    }

    const openedWindow = openWindow(url, "_blank");
    if (!openedWindow) return { mode, opened: false };

    try {
      // Retain a truthful open result, then sever cross-window scripting access immediately.
      openedWindow.opener = null;
    } catch {
      // A browser may protect WindowProxy properties after navigation; the accepted open still
      // succeeded.
    }

    return { mode, opened: true };
  } catch (error) {
    return { mode, opened: false, error };
  }
}
