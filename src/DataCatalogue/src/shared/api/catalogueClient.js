export class CatalogueApiError extends Error {
  constructor(message, { status = 0, errors = null, kind = "http" } = {}) {
    super(message);
    this.name = "CatalogueApiError";
    this.status = status;
    this.errors = errors;
    this.kind = kind;
  }
}

export function parseExactJson(text) {
  // Validate the original grammar before replacing integer tokens. Quoted content is untouched.
  JSON.parse(text);
  return JSON.parse(
    text.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
      if (/^-?\d+$/.test(token) && !Number.isSafeInteger(Number(token))) {
        return JSON.stringify(token);
      }
      return token;
    })
  );
}

export function createCatalogueClient({
  baseUrl = "",
  credentials = "same-origin",
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!["same-origin", "include", "omit"].includes(credentials)) {
    throw new Error("Invalid API credentials policy.");
  }
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable.");
  const base = baseUrl.replace(/\/+$/, "");
  if (/\s|\\/.test(base))
    throw new Error("API base URL must not contain whitespace or backslashes.");
  if (base && !base.startsWith("/")) {
    const url = new URL(base);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "API base URL must be an HTTP(S) origin/path without credentials, query or fragment."
      );
    }
  } else if (base.startsWith("//") || /[?#]/.test(base)) {
    throw new Error("Invalid API base path.");
  }

  return {
    async request(path, { query = {}, method = "GET", body, signal } = {}) {
      if (!path.startsWith("/api/v1/"))
        throw new Error("Only DataCatalogue v1 routes are supported.");
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
      }
      let response;
      try {
        response = await fetchImpl(`${base}${path}${params.size ? `?${params}` : ""}`, {
          method,
          credentials,
          signal,
          redirect: "error",
          headers: {
            Accept: "application/json",
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch (error) {
        if (signal?.aborted || error.name === "AbortError") throw error;
        throw new CatalogueApiError(
          "DataCatalogue API is unavailable. Check its origin, authentication and browser access.",
          { kind: "network" }
        );
      }
      if (response.status === 204) return null;
      const text = await response.text();
      const isJson = /(?:application\/json|\+json)(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? ""
      );
      let data = null;
      if (text && isJson) {
        try {
          data = parseExactJson(text);
        } catch {
          throw new CatalogueApiError("API returned invalid JSON.", {
            status: response.status,
            kind: "contract",
          });
        }
      }
      if (!response.ok) {
        const fallback =
          response.status === 401
            ? "Authentication required."
            : response.status === 403
              ? "Access denied."
              : `API request failed (HTTP ${response.status}).`;
        const errors = data?.errors ?? null;
        const validation =
          errors && typeof errors === "object" ? Object.values(errors).flat().join(" ") : "";
        throw new CatalogueApiError(
          [data?.title || fallback, data?.detail, validation].filter(Boolean).join(" "),
          { status: response.status, errors }
        );
      }
      if (!text) return null;
      if (!isJson) return text;
      return data;
    },
  };
}
