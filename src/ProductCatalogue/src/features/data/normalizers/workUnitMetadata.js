// Transport aliases stay at this boundary; popup code consumes current members only.
export function normalizeWorkUnitMetadata(payload, declarations, { aoi = false } = {}) {
  const members = {};
  for (const { key, field } of declarations) {
    const member = read(payload, field);
    const datasetName = String(read(member, aoi ? "datasetName" : "name") ?? "").trim();
    if (!datasetName) continue;
    members[key] = {
      datasetName,
      edition: read(member, aoi ? "currentEdition" : "edition"),
      update: read(member, aoi ? "currentUpdate" : "update"),
      issueDate: read(member, "issueDate"),
    };
  }
  return { members };
}

function read(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const alias = field[0].toUpperCase() + field.slice(1);
  const camel = field[0].toLowerCase() + field.slice(1);
  return value[camel] ?? value[alias];
}
