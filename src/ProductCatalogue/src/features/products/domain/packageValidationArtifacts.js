export function selectPackageValidationArtifacts(history, productContext) {
  // F6A validates the source-owned AOI specification. Neither URL aliases nor
  // package/member labels establish artifact ownership.
  const owner = createOwnerKey(
    productContext?.datasetName,
    productContext?.data?.attributes?.productSpecification
  );
  if (!owner)
    throw new Error("Validation artifact ownership could not be established for this Product.");

  const ownership = history.map((artifact) =>
    createOwnerKey(artifact.datasetName, artifact.productSpecification)
  );
  const claims = new Map();
  for (const [index, artifact] of history.entries()) {
    for (const [field, value] of [
      ["artifact", artifact.id],
      ["track", artifact.trackId],
    ]) {
      if (typeof value !== "string" || !value.trim()) continue;
      const key = `${field}:${value.trim().toUpperCase()}`;
      if (!claims.has(key)) claims.set(key, new Set());
      claims.get(key).add(ownership[index]);
    }
  }
  let hasUnattributedArtifacts = false;
  const artifacts = history.filter((artifact, index) => {
    // Conflicting ownership for the same artifact/track cannot select an
    // arbitrary member. This checks response evidence, not invented track links.
    const ambiguous = [
      ["artifact", artifact.id],
      ["track", artifact.trackId],
    ].some(
      ([field, value]) =>
        typeof value === "string" &&
        value.trim() &&
        claims.get(`${field}:${value.trim().toUpperCase()}`)?.size > 1
    );
    if (!ownership[index] || ambiguous) {
      hasUnattributedArtifacts = true;
      return false;
    }
    return ownership[index] === owner;
  });
  return { artifacts, hasUnattributedArtifacts };
}

function createOwnerKey(datasetName, specification) {
  if (typeof datasetName !== "string" || !datasetName.trim()) return null;
  const normalized = String(specification ?? "")
    .trim()
    .replace(/[\s_-]/g, "")
    .toUpperCase();
  // Registry AOIs use numeric specifications; artifact DTOs use enum names.
  // Accept their existing forms without converting unrelated specifications.
  const productSpecification = { 57: "S57", S57: "S57", 101: "S101", S101: "S101" }[normalized];
  return productSpecification
    ? JSON.stringify([datasetName.trim().toUpperCase(), productSpecification])
    : null;
}
