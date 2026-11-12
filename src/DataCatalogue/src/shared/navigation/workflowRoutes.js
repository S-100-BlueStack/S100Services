// Keep Package deep links independent of contextual Job IDs and host deployment paths.
export function assignmentPath(packageId = null, basePath = "/") {
  const path = `${normalizeBasePath(basePath)}assignments`;
  return packageId == null ? path : `${path}/packages/${encodeURIComponent(packageId)}`;
}

export function parseWorkflowPath(pathname, basePath = "/") {
  const base = normalizeBasePath(basePath);
  const path =
    base === "/" ? pathname : pathname?.startsWith(base) ? pathname.slice(base.length - 1) : null;
  if (path === "/assignments" || path === "/assignments/") {
    return { assignment: true, packageId: null };
  }
  const match = /^\/assignments\/packages\/([^/]+)\/?$/.exec(path ?? "");
  if (match) {
    try {
      return { assignment: true, packageId: decodeURIComponent(match[1]) };
    } catch {
      return { assignment: true, packageId: null };
    }
  }
  return { assignment: false, packageId: null };
}

export function getApplicationBasePath(pathname = "/") {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return "/";
  // Deep links must resolve to the same application root as the main-map URL.
  const routeSuffix = /\/assignments(?:\/packages\/[^/]+)?\/?$/.exec(pathname);
  if (routeSuffix) return normalizeBasePath(pathname.slice(0, routeSuffix.index));
  if (pathname.endsWith("/index.html")) {
    return normalizeBasePath(pathname.slice(0, -"index.html".length));
  }
  return normalizeBasePath(pathname);
}

function normalizeBasePath(path) {
  // A route must stay same-origin even when the incoming pathname contains //.
  const raw = typeof path === "string" && path.startsWith("/") ? path : "/";
  const segments = raw.split("/").filter(Boolean);
  return segments.length ? `/${segments.join("/")}/` : "/";
}
