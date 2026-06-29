import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-checkbox";
import "@esri/calcite-components/components/calcite-icon";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-popover";

import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/main.css";

import { createApp } from "./app/createApp.js";

const appElement = document.querySelector("#app");

if (!appElement) {
  throw new Error("Job Manager could not start because #app was not found.");
}

const app = await createApp(appElement);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
}
