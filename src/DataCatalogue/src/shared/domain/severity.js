export const UNPRIORITIZED_SEVERITY = "18446744073709551615";

export function normalizeSeverity(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(
      "Severity precision is unavailable. Supply an exact uint64 JSON integer or decimal string."
    );
  }
  if (
    !(
      (typeof value === "string" || typeof value === "number") &&
      /^(0|[1-9]\d*)$/.test(String(value))
    )
  ) {
    throw new Error("Severity must be an unsigned decimal integer or null.");
  }
  const exact = BigInt(value);
  if (exact > BigInt(UNPRIORITIZED_SEVERITY)) throw new Error("Severity exceeds uint64.");
  return exact.toString();
}

export function severityLabel(value) {
  const exact = normalizeSeverity(value);
  if (exact === null) return "Unspecified";
  return exact === UNPRIORITIZED_SEVERITY ? "Not prioritized" : `Severity ${exact}`;
}

export function compareSeverity(left, right) {
  const a = normalizeSeverity(left);
  const b = normalizeSeverity(right);
  // Unknown values have no numeric priority; the explicit sentinel always belongs last.
  const rank = (value) => (value === UNPRIORITIZED_SEVERITY ? 2 : value === null ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (a === b) return 0;
  return BigInt(a) < BigInt(b) ? -1 : 1;
}
