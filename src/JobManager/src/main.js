import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/main.css";

const appElement = document.querySelector("#app");

appElement.innerHTML = `
  <main class="job-manager-shell">
    <section class="job-manager-placeholder">
      <h1>Job Manager</h1>
      <p>Initial project shell is ready.</p>
    </section>
  </main>
`;
