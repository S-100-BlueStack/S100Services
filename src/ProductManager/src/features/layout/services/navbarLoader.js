export async function loadNavbar() {
  const res = await fetch(`${import.meta.env.BASE_URL}components/navbar.html`);
  const html = await res.text();

  document.getElementById("navbar").innerHTML = html;

  initializeNavbarLinks();
  initializeDocumentationButton();
}

function initializeNavbarLinks() {
  const homeLink = document.querySelector("[data-nav-home-link]");
  const analyzeLink = document.querySelector("[data-nav-analyze-link]");

  if (homeLink) {
    homeLink.href = getAppUrl("");
  }

  if (analyzeLink) {
    analyzeLink.href = getAppUrl("analyze/");
  }
}

function initializeDocumentationButton() {
  const docButton = document.getElementById("documentation-button");

  if (!docButton) {
    return;
  }

  docButton.addEventListener("click", () => {
    window.open("#", "_blank", "noopener,noreferrer");
  });
}

function getAppUrl(path) {
  const baseUrl = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const normalizedPath = String(path || "").replace(/^\/+/, "");

  return `${baseUrl}${normalizedPath}`;
}
