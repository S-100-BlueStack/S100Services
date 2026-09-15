export const statusColorConfig = {
  1: {
    fill: "rgba(51,160,44,0.35)",
    outline: "rgba(51,160,44,0.9)",
    header: "rgba(51,160,44,0.25)",
  },
  2: {
    fill: "rgba(56,168,255,0.35)",
    outline: "rgba(56,168,255,0.9)",
    header: "rgba(56,168,255,0.25)",
  },
  3: {
    fill: "rgba(178,102,255,0.35)",
    outline: "rgba(178,102,255,0.9)",
    header: "rgba(178,102,255,0.25)",
  },
  4: {
    fill: "rgba(255,10,10,0.35)",
    outline: "rgba(255,10,10,0.9)",
    header: "rgba(255,10,10,0.25)",
  },
  5: {
    fill: "rgba(255,165,0,0.35)",
    outline: "rgba(255,165,0,0.9)",
    header: "rgba(255,165,0,0.25)",
  },
};

for (const [id, rgb] of Object.entries({
  6: "120,120,180",
  7: "210,60,60",
  8: "190,155,35",
  9: "55,130,210",
  10: "135,95,190",
  11: "40,155,130",
  12: "45,140,80",
  13: "35,125,65",
  14: "130,130,130",
  15: "220,45,45",
})) {
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
