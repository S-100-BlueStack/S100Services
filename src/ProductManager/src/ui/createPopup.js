export function createPopup() {
  return {
    title: "{datasetName}",

    content: (event) => {
      const attr = event.graphic.attributes;

      const container = document.createElement("div");
      container.className = "popup-container";

      const section = document.createElement("div");
      section.className = "popup-section";

      container.appendChild(section);

      //section.appendChild(createRow("Dataset", attr.datasetName, true));
      section.appendChild(createRow("Edition", attr.edition));
      section.appendChild(createRow("Update", attr.update));
      section.appendChild(createStatusRow(attr.status));

      return container;
    },

    visibleElements: {
      collapseButton: false,
      featureNavigation: false,
    },
  };
}

function createRow(label, value, withCopy = false) {
  const row = document.createElement("div");
  row.className = "popup-row";

  const labelEl = document.createElement("span");
  labelEl.className = "popup-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "popup-value";
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);

  if (withCopy) {
    const copy = document.createElement("calcite-action");
    copy.setAttribute("icon", "copy");
    copy.setAttribute("scale", "s");
    copy.className = "copy-btn";
    copy.dataset.copy = value;

    row.appendChild(copy);
  }

  return row;
}

function createStatusRow(status) {
  const row = document.createElement("div");
  row.className = "popup-row";

  const label = document.createElement("span");
  label.className = "popup-label";
  label.textContent = "Status";

  const badge = document.createElement("calcite-badge");
  badge.setAttribute("scale", "s");
  badge.textContent = status;

  row.appendChild(label);
  row.appendChild(badge);

  return row;
}
