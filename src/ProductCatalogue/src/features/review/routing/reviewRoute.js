export function getCurrentReviewRoute() {
  const pathname = getPathnameWithoutBase(window.location.pathname);
  const match = pathname.match(/^\/review(?:\/(.+))?\/?$/i);

  if (!match) {
    return {
      name: "review",
      datasetNames: [],
    };
  }

  return {
    name: "review",
    datasetNames: parseReviewDatasetNames(match[1] ?? ""),
  };
}

export function buildReviewUrl(datasetNames) {
  const names = normalizeDatasetNames(datasetNames);
  const encodedNames = names.map((datasetName) => encodeURIComponent(datasetName)).join("&");
  const baseUrl = getBaseUrl();

  return `${baseUrl}review/${encodedNames}`;
}

export function setReviewRouteUrl(datasetNames, { replace = false } = {}) {
  const nextUrl = buildReviewUrl(datasetNames);
  const method = replace ? "replaceState" : "pushState";

  window.history[method](
    {
      route: "review",
      datasetNames: normalizeDatasetNames(datasetNames),
    },
    "",
    nextUrl
  );
}

export function createReviewDocumentTitle(datasetNames) {
  const names = normalizeDatasetNames(datasetNames);

  if (names.length === 0) {
    return "Product Review - Product Catalogue";
  }

  if (names.length === 1) {
    return `Review ${names[0]} - Product Catalogue`;
  }

  return `Review ${names.length} products - Product Catalogue`;
}

export function parseReviewDatasetNames(value) {
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
