export function initializeNavbarBranding(image, branding) {
  if (!image) return;

  let usesCustomLogo = branding.usesCustomLogo;

  function handleError() {
    if (usesCustomLogo) {
      // Change state before src so even an immediate fallback failure cannot retry it.
      usesCustomLogo = false;
      image.alt = branding.fallbackAlt;
      image.src = branding.fallbackSrc;
      return;
    }

    image.removeEventListener("error", handleError);
    // Remove the failed resource while retaining the generic alt and reserved space.
    image.removeAttribute("src");
  }

  image.addEventListener("error", handleError);
  image.alt = branding.alt;
  image.src = branding.src;
}
