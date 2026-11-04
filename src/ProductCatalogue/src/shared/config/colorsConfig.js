const PRODUCT_STATUS_RGB = Object.freeze({
  1: "115,125,120", // Idle
  2: "55,150,85", // Exported
  5: "115,120,190", // Frozen
  6: "55,120,195", // In Transit
  7: "205,55,55", // Rejected
  8: "205,140,30", // Changes Detected
  9: "55,135,210", // Exporting
  10: "125,95,190", // Validating
  11: "40,155,130", // Ready For Distribution
  12: "45,145,80", // Accepted For Distribution
  13: "95,125,105", // Published
  14: "130,130,130", // Cancelled
  15: "220,45,45", // Error
});

// EncPackageStatus IDs are distinct from ProductState, even when the numbers overlap.
const PACKAGE_STATUS_RGB = Object.freeze({
  0: "115,125,120", // Idle
  2: "45,145,80", // Ready
  3: "55,120,195", // InTransit
  4: "220,45,45", // Error
  5: "215,135,25", // Hold
});

// Popup headers should keep the pre-existing, theme-friendly translucency.
// Badges use translucent fills to remain readable in both light and dark themes.
export const packageStatusColorConfig = Object.fromEntries(
  Object.entries(PACKAGE_STATUS_RGB).map(([id, rgb]) => [
    id,
    {
      fill: `rgba(${rgb},0.1)`,
      outline: `rgba(${rgb},0.95)`,
      header: `rgba(${rgb},0.25)`,
      badge: `rgba(${rgb},0.18)`,
    },
  ])
);

export const statusColorConfig = {};

for (const [id, rgb] of Object.entries(PRODUCT_STATUS_RGB)) {
  statusColorConfig[id] = {
    fill: `rgba(${rgb},0.35)`,
    outline: `rgba(${rgb},0.9)`,
    header: `rgba(${rgb},0.25)`,
  };
}

export const highlightConfig = [
  {
    name: "hover-highlight",
    color: "yellow",
    haloOpacity: 0.9,
    fillOpacity: 0.1,
    shadowColor: "black",
    shadowOpacity: 0.4,
    shadowDifference: 0.2,
  },
];
