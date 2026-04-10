const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || "/");

function normalizeBaseUrl(value) {
  return String(value ?? "")
    .trim()
    .replace(/\/+$/, "");
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function buildUrl(path) {
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");

  if (!normalizedPath) {
    return API_BASE_URL || "/";
  }

  if (isAbsoluteUrl(normalizedPath)) {
    return normalizedPath;
  }

  if (!API_BASE_URL) {
    return `/${normalizedPath}`;
  }

  return `${API_BASE_URL}/${normalizedPath}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json");

  let data = null;

  try {
    if (response.status !== 204) {
      data = isJson ? await response.json() : await response.text();
    }
  } catch {
    data = null;
  }

  if (response.ok) {
    return {
      success: true,
      status: response.status,
      data,
    };
  }

  return {
    success: false,
    status: response.status,
    statusText: response.statusText,
    data,
    isUnauthorized: response.status === 401,
    isForbidden: response.status === 403,
  };
}

export async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(buildUrl(path), {
      credentials: "include",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers ?? {}),
      },
    });

    return await parseResponse(response);
  } catch (error) {
    return {
      success: false,
      networkError: true,
      errorMessage: error instanceof Error ? error.message : "Unknown network error",
    };
  }
}

export async function apiGet(path, defaultMessage = "Request failed") {
  const result = await apiRequest(path);

  if (!result.success) {
    if (result.networkError) {
      throw new Error(result.errorMessage || defaultMessage);
    }

    if (typeof result.data === "string" && result.data.trim()) {
      throw new Error(`${defaultMessage}: ${result.data}`);
    }

    throw new Error(
      `${defaultMessage}: (${result.status}) ${result.statusText ?? "Request failed"}`
    );
  }

  return result.data;
}
