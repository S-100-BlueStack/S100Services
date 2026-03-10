export async function inspectLayer(layer) {
  await layer.load();

  console.group("Layer info");

  console.log("Layer title:", layer.title);
  console.log("Layer type:", layer.type);

  // FeatureLayer
  if (layer.fields) {
    console.table(
      layer.fields.map((f) => ({
        name: f.name,
        type: f.type,
      })),
    );
  }

  // MapImageLayer / Sublayers
  else if (layer.sublayers) {
    layer.sublayers.forEach((sublayer) => {
      console.group(`Sublayer: ${sublayer.title}`);

      if (sublayer.fields) {
        console.table(
          sublayer.fields.map((f) => ({
            name: f.name,
            type: f.type,
          })),
        );
      }

      console.groupEnd();
    });
  }

  console.groupEnd();
}
