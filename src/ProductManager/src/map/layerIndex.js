export function createLayerIndex(graphics) {
  const index = new Map();

  for (const g of graphics) {
    index.set(g.attributes.id, g);
  }

  return index;
}
