import { apiGet } from "../../../shared/api/apiClient.js";

export function createDataSourceLoader({ get = apiGet } = {}) {
  return async function loadDataSource(source, { signal } = {}) {
    const loader = source?.loader;
    if (!loader) {
      throw new Error(`Data source "${source?.label ?? source?.id ?? "unknown"}" has no loader.`);
    }

    if (loader.type !== "http-json") {
      throw new Error(`Unsupported data source loader type: ${loader.type ?? "unknown"}.`);
    }

    return get(loader.path, loader.errorMessage, { signal });
  };
}
