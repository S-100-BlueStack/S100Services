import PopupTemplate from "@arcgis/core/PopupTemplate.js";

export async function stylePopups(layers) {
  const prodCatLayer = layers.find((l) => l.title === "Product Catalog");
  if (!prodCatLayer) return;

  await prodCatLayer.load();

  const paperLayer = prodCatLayer.sublayers.find(
    (x) => x.title === "Paper Charts",
  );

  if (!paperLayer) return;
  paperLayer.popupEnabled = true;
  paperLayer.outFields = ["*"];
  await paperLayer.load();
  paperLayer.popupTemplate = new PopupTemplate({
    title: "{PRODUCTNAME}",
    content: async (event) => {
      const objectId = event.graphic.attributes.OBJECTID;

      const query = paperLayer.createQuery();
      query.objectIds = [objectId];
      query.outFields = ["*"];

      const result = await paperLayer.queryFeatures(query);

      const attr = result.features[0].attributes;

      return `
        <div class="popup-content">
          <div><b>International Name:</b> ${attr.INTNAME}</div>
          <div><b>Status:</b> ${attr.created_date}</div>
        </div>
      `;
    },
  });
}
