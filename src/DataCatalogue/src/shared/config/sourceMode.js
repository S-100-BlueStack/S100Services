export function resolveSourceMode(value = "mock") {
  if (value !== "mock" && value !== "live")
    throw new Error(`Unsupported DataCatalogue source mode: ${value}`);
  return value;
}
