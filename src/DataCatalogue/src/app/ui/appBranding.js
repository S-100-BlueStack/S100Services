const DEFAULT_LOGO_URL = "/images/logo96.png";
const DEFAULT_LOGO_ALT = "GST";
const DEFAULT_FAVICON_URL = DEFAULT_LOGO_URL;

export function applyAppBranding({ navbarElement, config = {}, documentRef = document } = {}) {
  const logo = navbarElement?.querySelector(".navbar-logo");
  const favicon = documentRef.getElementById("data-catalogue-favicon");

  if (!logo || !favicon) {
    throw new Error("DataCatalogue branding elements are missing.");
  }

  const customLogoUrl = resolveBrandingUrl(config.appLogoUrl);
  logo.alt = normalizeAltText(config.appLogoAlt);

  if (customLogoUrl) {
    // Broken IIS virtual-directory assets must not leave the shared navbar without a logo.
    logo.addEventListener(
      "error",
      () => {
        logo.alt = DEFAULT_LOGO_ALT;
        logo.src = DEFAULT_LOGO_URL;
      },
      { once: true }
    );
  }

  logo.src = customLogoUrl || DEFAULT_LOGO_URL;
  favicon.href = resolveBrandingUrl(config.appFaviconUrl) || DEFAULT_FAVICON_URL;
}

function normalizeAltText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_LOGO_ALT;
}

export function resolveBrandingUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  const url = value.trim();
  if (!url || url.startsWith("//") || url.startsWith("\\")) {
    return "";
  }

  // Browser-visible config should not permit active URL schemes in image/link attributes.
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(url)?.[0].toLowerCase();
  if (scheme && scheme !== "https:" && scheme !== "http:") {
    return "";
  }

  return url;
}
