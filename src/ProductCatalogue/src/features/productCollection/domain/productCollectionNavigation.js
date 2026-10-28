const DESTINATION_LABELS = Object.freeze({ analyze: "Analyze", review: "Review" });

export function getCollectionNavigationAvailability(items, destination) {
  if (!Object.hasOwn(DESTINATION_LABELS, destination)) {
    return { allowed: false, reason: "This collection destination is unavailable." };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { allowed: false, reason: "Add a Product to the collection first." };
  }
  if (items.some((item) => item?.navigationCapabilities?.[destination] !== true)) {
    return {
      allowed: false,
      reason: `${DESTINATION_LABELS[destination]} is not available for all collected work units.`,
    };
  }
  return { allowed: true, reason: null };
}
