const WORKSPACE_PATHS = Object.freeze({ analyze: "Analyze", review: "Review" });

export function getWorkspaceBaseUrl() {
  return String(import.meta.env?.BASE_URL || "/").replace(/\/?$/, "/");
}

export function normalizeWorkspaceDatasetNames(name, datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];
  const seen = new Set();
  return values
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      // Match each existing workspace list's identity without changing its first spelling.
      const key = name === "analyze" ? value.toLowerCase() : value.toUpperCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildWorkspaceUrl(
  name,
  datasetNames,
  { baseUrl = getWorkspaceBaseUrl(), origin = window.location.origin } = {}
) {
  const path = WORKSPACE_PATHS[name];
  if (!path) throw new TypeError("Unknown workspace route.");
  const names = normalizeWorkspaceDatasetNames(name, datasetNames);
  // A comma-bearing name cannot be represented by the fixed comma-delimited contract.
  // Return no link instead of navigating to a different set of Products.
  if (names.some((value) => value.includes(","))) return null;
  const base = new URL(String(baseUrl).replace(/\/?$/, "/"), origin);
  const url = new URL(path, base);
  url.searchParams.set("Datasets", names.join(","));
  return url.pathname + url.search;
}

export function parseWorkspaceRoute(
  value,
  { baseUrl = getWorkspaceBaseUrl(), origin = window.location.origin } = {}
) {
  const url = new URL(value, origin);
  const basePath = new URL(baseUrl, origin).pathname.replace(/\/+$/, "");
  if (basePath && !url.pathname.startsWith(basePath + "/")) return null;
  const pathname = url.pathname.slice(basePath.length) || "/";
  const match = pathname.match(/^\/(analyze|review)(?:\/(.+))?\/?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const datasetNames = url.searchParams.has("Datasets")
    ? normalizeWorkspaceDatasetNames(name, (url.searchParams.get("Datasets") ?? "").split(","))
    : parseLegacyWorkspaceDatasetNames(name, match[2] ?? "");
  return { name, datasetNames };
}

export function parseLegacyWorkspaceDatasetNames(name, value) {
  return normalizeWorkspaceDatasetNames(
    name,
    String(value ?? "")
      .split("&")
      .map((part) => {
        try {
          return decodeURIComponent(part.trim());
        } catch {
          // Keep malformed legacy escapes as literal input for the existing resolver.
          return part;
        }
      })
  );
}

export function setWorkspaceRouteUrl(name, datasetNames, { replace = true } = {}) {
  const nextUrl = buildWorkspaceUrl(name, datasetNames);
  if (!nextUrl) return false;
  const url = new URL(nextUrl, window.location.origin);
  const currentUrl = new URL(window.location.href);
  // Unrelated query state and fragments do not belong to the Product route boundary.
  for (const [key, value] of currentUrl.searchParams) {
    if (key !== "Datasets") url.searchParams.append(key, value);
  }
  url.hash = currentUrl.hash;
  if (url.href === currentUrl.href) return false;
  window.history[replace ? "replaceState" : "pushState"](
    {
      ...window.history.state,
      route: name,
      datasetNames: normalizeWorkspaceDatasetNames(name, datasetNames),
    },
    "",
    url.pathname + url.search + url.hash
  );
  return true;
}
