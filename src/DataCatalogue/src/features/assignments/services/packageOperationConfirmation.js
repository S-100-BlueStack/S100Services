import { operationText } from "../../../shared/api/packageComments.js";

const EVENT_TYPES = {
  discardReason: "packageDiscarded",
  reopen: "packageReopened",
};

export async function readConfirmedPackageOperations(catalogue, packageId, operations, signal) {
  if (!operations.length) return [];
  const remaining = new Map(operations.map((operation) => [operation.id, operation]));
  const confirmed = [];
  const cursors = new Set();
  let before = null;
  do {
    signal.throwIfAborted();
    const page = await catalogue.packageHistory(packageId, { before, signal });
    for (const item of page.items) {
      const operation = remaining.get(item.operationId);
      if (!operation) continue;
      if (
        item.eventType !== EVENT_TYPES[operation.kind] ||
        (item.commentText ?? null) !== operationText(operation)
      ) {
        throw new Error("The operation ID belongs to a different saved Package change.");
      }
      remaining.delete(operation.id);
      confirmed.push(operation.id);
    }
    before = page.nextBefore;
    if (before && cursors.has(before))
      throw new Error("Package history continuation did not advance.");
    cursors.add(before);
  } while (before && remaining.size);
  return confirmed;
}
