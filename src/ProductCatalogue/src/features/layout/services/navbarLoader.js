import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import fallbackLogoUrl from "../../../assets/product-catalogue-logo.svg?no-inline";
import { applyWorkspaceLinkNavigation } from "../../../app/routing/workspaceNavigation.js";
import { resolveBranding } from "../../../shared/config/brandingConfig.js";
import { initializeNavbarBranding } from "./navbarBranding.js";
import { getCurrentRoute } from "../../../app/routing/appRoute.js";
import { applyNavbarRouteState } from "./navbarRouteState.js";

export async function loadNavbar() {
  const res = await fetch(`${import.meta.env.BASE_URL}components/navbar.html`);
  const html = await res.text();

  document.getElementById("navbar").innerHTML = html;

  initializeNavbarBranding(
    document.querySelector("[data-navbar-logo]"),
    resolveBranding({ fallbackSrc: fallbackLogoUrl })
  );
  initializeNavbarLinks(getCurrentRoute());
  initializeDocumentationButton();
}

function initializeNavbarLinks(route) {
  const homeLink = document.querySelector("[data-nav-home-link]");
  const dashboardLink = document.querySelector("[data-nav-dashboard-link]");
  const analyzeLink = document.querySelector("[data-nav-analyze-link]");
  const reviewLink = document.querySelector("[data-nav-review-link]");

  if (homeLink) {
    homeLink.href = getAppUrl("");
  }

  if (dashboardLink) {
    dashboardLink.href = getAppUrl("dashboard/");
    applyWorkspaceLinkNavigation(dashboardLink, route, "dashboard");
  }

  if (analyzeLink) {
    analyzeLink.href = buildAnalyzeUrl([]);
    applyWorkspaceLinkNavigation(analyzeLink, route, "analyze");
  }

  if (reviewLink) {
    reviewLink.href = buildReviewUrl([]);
    applyWorkspaceLinkNavigation(reviewLink, route, "review");
  }

  applyNavbarRouteState(document, route);
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
