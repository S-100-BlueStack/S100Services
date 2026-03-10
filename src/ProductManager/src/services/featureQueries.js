export async function queryLargeCities(layer) {
  const query = layer.createQuery();

  // query.where = "POPULATION > 1000000";
  query.outFields = ["*"];
  query.returnGeometry = true;

  const result = await layer.queryFeatures(query);

  return result.features;
}
