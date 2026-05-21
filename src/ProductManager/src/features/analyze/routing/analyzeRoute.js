export function getCurrentRoute() {
  const pathname = getPathnameWithoutBase(window.location.pathname);
  const match = pathname.match(/^\/analyze(?:\/(.+))?\/?$/i);

  if (!match) {
    return { name: "main" };
  }

  return {
    name: "analyze",
    datasetNames: parseAnalyzeDatasetNames(match[1] ?? ""),
  };
}

export function buildAnalyzeUrl(datasetNames) {
  const names = normalizeDatasetNames(datasetNames);
  const encodedNames = names.map((datasetName) => encodeURIComponent(datasetName)).join("&");
  const baseUrl = getBaseUrl();

  return `${baseUrl}analyze/${encodedNames}`;
}

export function getAppHomeUrl() {
  return getBaseUrl();
}

function parseAnalyzeDatasetNames(value) {
  return String(value)
    .split("&")
    .map((part) => safeDecodeURIComponent(part.trim()))
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDatasetNames(datasetNames) {
  const values = Array.isArray(datasetNames) ? datasetNames : [datasetNames];

  return values.map((value) => String(value ?? "").trim()).filter(Boolean);
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

export function setAnalyzeRouteUrl(datasetNames, { replace = false } = {}) {
  const nextUrl = buildAnalyzeUrl(datasetNames);
  const method = replace ? "replaceState" : "pushState";

  window.history[method](
    {
      route: "analyze",
      datasetNames: normalizeDatasetNames(datasetNames),
    },
    "",
    nextUrl
  );
}

export function createAnalyzeDocumentTitle(datasetNames) {
  const names = normalizeDatasetNames(datasetNames);

  if (names.length === 0) {
    return "Analyze - Product Manager";
  }

  if (names.length === 1) {
    return `Analyze ${names[0]} - Product Manager`;
  }

  return `Analyze ${names.length} products - Product Manager`;
}
