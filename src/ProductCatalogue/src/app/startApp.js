import fallbackFaviconUrl from "../assets/product-catalogue-logo.svg?no-inline";
import { resolveFaviconBranding } from "../shared/config/brandingConfig.js";
import { initializeFaviconBranding } from "../features/layout/services/faviconBranding.js";

initializeFaviconBranding(
  document.querySelector("[data-app-favicon]"),
  resolveFaviconBranding({ fallbackSrc: fallbackFaviconUrl })
);
