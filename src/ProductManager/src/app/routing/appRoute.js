export function getCurrentRoute() {
  const pathname = getPathnameWithoutBase(window.location.pathname);

  const dashboardMatch = pathname.match(/^\/dashboard\/?$/i);
  if (dashboardMatch) {
    return {
      name: "dashboard",
      ...parseDashboardSearch(window.location.search),
    };
  }

  const analyzeMatch = pathname.match(/^\/analyze(?:\/(.+))?\/?$/i);
  if (analyzeMatch) {
    return {
      name: "analyze",
      datasetNames: parseDatasetNames(analyzeMatch[1] ?? ""),
    };
  }

  const reviewMatch = pathname.match(/^\/review(?:\/(.+))?\/?$/i);
  if (reviewMatch) {
    return {
      name: "review",
      datasetNames: parseDatasetNames(reviewMatch[1] ?? ""),
    };
  }

  return { name: "main" };
}

function parseDashboardSearch(search) {
  const params = new URLSearchParams(search || "");

  return {
    rangePreset: params.get("range") || params.get("preset") || "since-yesterday",
    from: params.get("from"),
    to: params.get("to"),
  };
}

function parseDatasetNames(value) {
  return String(value)
    .split("&")
    .map((part) => safeDecodeURIComponent(part.trim()))
    .map((part) => part.trim())
    .filter(Boolean);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getPathnameWithoutBase(pathname) {
  const basePath = getBasePath();

  if (basePath && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length) || "/";
  }

  return pathname || "/";
}

function getBasePath() {
  const baseUrl = getBaseUrl();
  const basePath = new URL(baseUrl, window.location.origin).pathname;

  return basePath === "/" ? "" : basePath.replace(/\/+$/, "");
}

function getBaseUrl() {
  return String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
}
