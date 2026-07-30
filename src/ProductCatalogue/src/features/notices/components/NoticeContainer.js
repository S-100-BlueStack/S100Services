export function createNoticeContainer() {
  let container = document.getElementById("notice-container");

  if (!container) {
    container = document.createElement("div");
    container.id = "notice-container";

    container.innerHTML = `
            <calcite-toast-manager position="top-end"></calcite-toast-manager>
        `;

    document.body.appendChild(container);
  }

  return container.querySelector("calcite-toast-manager");
}
