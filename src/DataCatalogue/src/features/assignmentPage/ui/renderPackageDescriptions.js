// The API may return formatted text. Treat it as untrusted HTML; only a small
// document-oriented element/attribute allowlist is copied into the live DOM.
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "SPAN",
  "DIV",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TH",
  "TD",
  "UL",
  "OL",
  "LI",
  "A",
  "H3",
  "H4",
  "SUP",
  "SUB",
]);
const BLOCKED_CONTENT = new Set([
  "SCRIPT",
  "STYLE",
  "SVG",
  "MATH",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "FORM",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "BUTTON",
  "TEMPLATE",
  "LINK",
  "META",
  "BASE",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "NOSCRIPT",
]);
const ALLOWED_CLASSES = new Set(["position-table", "pos-index", "pos-col"]);

export function isSafeDescriptionUrl(href, base = "https://example.invalid/") {
  try {
    const url = new URL(href, base);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function cleanNode(node, doc) {
  if (node.nodeType === 3) return doc.createTextNode(node.textContent ?? "");
  if (node.nodeType !== 1 || BLOCKED_CONTENT.has(node.tagName)) return null;
  if (!ALLOWED_TAGS.has(node.tagName)) {
    const fragment = doc.createDocumentFragment();
    for (const child of node.childNodes) {
      const clean = cleanNode(child, doc);
      if (clean) fragment.append(clean);
    }
    return fragment;
  }
  const result = doc.createElement(node.tagName.toLowerCase());
  if (node.tagName === "A") {
    const href = node.getAttribute("href")?.trim();
    if (href && isSafeDescriptionUrl(href, doc.baseURI)) {
      result.setAttribute("href", href);
      result.setAttribute("rel", "noopener noreferrer");
      result.setAttribute("target", "_blank");
    }
  }
  if (node.tagName === "TABLE" || node.tagName === "TH" || node.tagName === "TD") {
    const classes = (node.getAttribute("class") || "")
      .split(/\s+/)
      .filter((name) => ALLOWED_CLASSES.has(name));
    if (classes.length) result.className = classes.join(" ");
  }
  if (node.tagName === "TH" || node.tagName === "TD") {
    for (const attribute of ["colspan", "rowspan"]) {
      const value = Number(node.getAttribute(attribute));
      if (Number.isSafeInteger(value) && value >= 1 && value <= 20)
        result.setAttribute(attribute, String(value));
    }
  }
  for (const child of node.childNodes) {
    const clean = cleanNode(child, doc);
    if (clean) result.append(clean);
  }
  return result;
}

export function appendSanitizedHtml(target, source, doc = document) {
  const template = doc.createElement("template");
  template.innerHTML = String(source ?? "").slice(0, 200_000);
  const fragment = doc.createDocumentFragment();
  for (const child of template.content.childNodes) {
    const clean = cleanNode(child, doc);
    if (clean) fragment.append(clean);
  }
  target.append(fragment);
}

export function renderPackageDescriptions(container, entries, fallback) {
  container.replaceChildren();
  if (!Array.isArray(entries) || !entries.length) {
    container.textContent = fallback || "Not provided";
    return;
  }
  for (const entry of entries) {
    if (!entry?.description) continue;
    const section = document.createElement("section");
    section.className = "dc-package-description";
    const label = document.createElement("div");
    label.className = "dc-package-description__language";
    label.textContent = entry.language || "Unspecified language";
    const body = document.createElement("div");
    body.className = "dc-package-description__body";
    appendSanitizedHtml(body, entry.description);
    section.append(label, body);
    container.append(section);
  }
  if (!container.childNodes.length) container.textContent = fallback || "Not provided";
}
