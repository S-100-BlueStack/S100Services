const API_BASE_URL = "https://localhost:7271";

function joinUrl(path) {
  if (!path) {
    return API_BASE_URL;
  }

  return `${API_BASE_URL}/${String(path).replace(/^\/+/, "")}`;
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let body = null;

  try {
    body = isJson ? await response.json() : await response.text();
  } catch {
    body = null;
  }

  if (response.ok) {
    return {
      success: true,
      status: response.status,
      data: body,
    };
  }

  return {
    success: false,
    status: response.status,
    statusText: response.statusText,
    data: body,
    isUnauthorized: response.status === 401,
    isForbidden: response.status === 403,
  };
}

export async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(joinUrl(path), {
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
