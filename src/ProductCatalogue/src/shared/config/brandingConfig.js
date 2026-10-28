const GENERIC_LOGO_ALT = "Product Catalogue";

export function resolveBranding({
  fallbackSrc,
  env = import.meta.env,
  documentUrl = globalThis.document?.baseURI,
} = {}) {
  const customSrc = resolveBrandingUrl(env?.VITE_APP_LOGO_URL, env?.BASE_URL, documentUrl);

  return {
    src: customSrc || fallbackSrc,
    alt: customSrc ? normalizeString(env?.VITE_APP_LOGO_ALT) || GENERIC_LOGO_ALT : GENERIC_LOGO_ALT,
    fallbackSrc,
    fallbackAlt: GENERIC_LOGO_ALT,
    usesCustomLogo: Boolean(customSrc),
  };
}

export function resolveFaviconBranding({
  fallbackSrc,
  env = import.meta.env,
  documentUrl = globalThis.document?.baseURI,
} = {}) {
  const customSrc = resolveBrandingUrl(env?.VITE_APP_FAVICON_URL, env?.BASE_URL, documentUrl);

  return {
    src: customSrc || fallbackSrc,
    fallbackSrc,
    usesCustomFavicon: Boolean(customSrc),
  };
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveBrandingUrl(value, baseUrl, documentUrl) {
  const candidate = normalizeString(value);
  // Reject ambiguous browser URL rewrites as well as unsupported explicit schemes.
  const hasControlCharacter = Array.from(candidate).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!candidate || hasControlCharacter || candidate.includes("\\") || candidate.startsWith("//")) {
    return null;
  }

  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
      if (!/^https?:\/\//i.test(candidate)) return null;
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return candidate;
    }

    if (candidate.startsWith("/")) return candidate;

    // BASE_URL owns the deployment path; the document supplies only its URL context.
    const applicationBase = new URL(normalizeString(baseUrl) || "./", documentUrl);
    const url = new URL(candidate, applicationBase);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
}
