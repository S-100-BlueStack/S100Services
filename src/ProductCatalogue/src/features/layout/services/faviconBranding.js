export function initializeFaviconBranding(link, branding) {
  if (!link || !branding.usesCustomFavicon) return;

  // Favicon error events are browser-dependent; handle a reported failure without probing.
  link.addEventListener(
    "error",
    () => {
      link.href = branding.fallbackSrc;
    },
    { once: true }
  );
  link.href = branding.src;
}
