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
