const key = (name) =>
  String(name ?? "")
    .trim()
    .toUpperCase();

export function reconcileWorkspaceResolutions(resolutions, { surface = "Workspace" } = {}) {
  const claims = [];
  const parents = [];
  const aliasOwners = new Map();
  const identityOwners = new Map();

  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const claimOwner = (owners, name, index) => {
    if (owners.has(name)) parents[find(index)] = find(owners.get(name));
    owners.set(name, index);
  };

  for (const resolution of resolutions) {
    if (resolution.status !== "resolved" || resolution.workUnit?.kind !== "package") continue;
    const index = claims.length;
    parents.push(index);
    const members = resolution.workUnit.members ?? [];
    const aliases = new Set(
      [
        key(resolution.requestedDatasetName),
        key(resolution.product?.datasetName),
        ...members.map((member) => key(member.datasetName)),
      ].filter(Boolean)
    );
    claims.push({
      resolution,
      signature: JSON.stringify([
        resolution.workUnit.identityKey,
        key(resolution.product?.datasetName),
        resolution.product?.sourceId,
        resolution.product?.identityKey,
        resolution.workUnit.primaryMemberKey,
        members.map((member) => [member.key, member.sourceId, key(member.datasetName)]),
        resolution.memberProducts?.map((product) => [
          product.sourceId, key(product.datasetName), product.identityKey,
          product.productKey, product.data?.attributes?.productSpecification,
        ]),
      ]),
    });
    for (const alias of aliases) claimOwner(aliasOwners, alias, index);
    claimOwner(identityOwners, resolution.workUnit.identityKey, index);
  }

  const groups = new Map();
  claims.forEach((claim, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(claim);
    groups.set(root, group);
  });

  const result = [];
  const publishedGroups = new Set();
  const publishedNames = new Set();
  // A later complete proof owns all its requested aliases, including earlier failures.
  // Scan the original order so that replacement preserves the first logical occurrence.
  for (const resolution of resolutions) {
    const name = key(resolution.requestedDatasetName);
    if (!aliasOwners.has(name)) {
      if (!publishedNames.has(name)) result.push(resolution);
      publishedNames.add(name);
      continue;
    }
    const root = find(aliasOwners.get(name));
    if (publishedGroups.has(root)) continue;
    publishedGroups.add(root);
    const group = groups.get(root);
    if (new Set(group.map((claim) => claim.signature)).size > 1) {
      result.push({
        status: "failed",
        requestedDatasetName: resolution.requestedDatasetName,
        datasetName: resolution.requestedDatasetName,
        product: null,
        workUnit: null,
        providerErrors: group.flatMap((claim) => claim.resolution.providerErrors ?? []),
        error: `Conflicting ${surface} package ownership or canonical identity.`,
      });
    } else {
      result.push({
        ...group[0].resolution,
        requestedDatasetName: resolution.requestedDatasetName,
      });
    }
  }
  return result;
}
