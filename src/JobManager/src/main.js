import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/main.css";

import { createApp } from "./app/createApp.js";

const appElement = document.querySelector("#app");

if (!appElement) {
  throw new Error("Job Manager could not start because #app was not found.");
}

const app = createApp(appElement);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    app.destroy();
  });
}
