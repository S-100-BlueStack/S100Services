const PRIMARY_ROUTE_NAMES = new Set(["main", "dashboard", "analyze", "review"]);

export function resolvePrimaryRouteName(route) {
  const routeName = String(route?.name ?? "")
    .trim()
    .toLowerCase();

  return PRIMARY_ROUTE_NAMES.has(routeName) ? routeName : "main";
}

export function applyNavbarRouteState(root, route) {
  const currentRouteName = resolvePrimaryRouteName(route);
  const links = Array.from(root?.querySelectorAll?.("[data-nav-route]") ?? []);

  for (const link of links) {
    if (link.dataset.navRoute === currentRouteName) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  }

  return currentRouteName;
}
