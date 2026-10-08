import { normalizeAnalyzeDatasetItems } from "./analyzeDatasetList.js";

const key = (name) =>
  String(name ?? "")
    .trim()
    .toUpperCase();

export function canonicalizeAnalyzeItems(items, products) {
  const aliases = new Map();
  for (const product of products) {
    if (product.workUnit?.kind !== "package") continue;
    for (const member of product.workUnit.members) {
      aliases.set(key(member.datasetName), product.datasetName);
    }
  }
  const result = new Map();
  for (const item of normalizeAnalyzeDatasetItems(items)) {
    const name = aliases.get(key(item.name)) ?? item.name;
    const existing = result.get(key(name));
    if (existing) existing.enabled ||= item.enabled;
    else result.set(key(name), { name, enabled: item.enabled });
  }
  return normalizeAnalyzeDatasetItems([...result.values()]);
}

export function retainAcceptedAnalyzePackages(products, accepted) {
  const previous = new Map(accepted.map((product) => [key(product.datasetName), product]));
  return products.map((product) => {
    const old = previous.get(key(product.datasetName));
    // A failed replacement cannot publish an incomplete member snapshot.
    return old?.members && product.workspaceLoadState === "failed"
      ? { ...old, loadError: product.loadError }
      : product;
  });
}

export function mergeAnalyzeRefresh(current, refreshed, names) {
  const byName = new Map(current.map((product) => [key(product.datasetName), product]));
  for (const product of retainAcceptedAnalyzePackages(refreshed, current)) {
    byName.set(key(product.datasetName), product);
  }
  return names.map((name) => byName.get(key(name))).filter(Boolean);
}

export function reconcileAnalyzeResolutions(resolutions) {
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
        error: "Conflicting Analyze package ownership or canonical identity.",
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
