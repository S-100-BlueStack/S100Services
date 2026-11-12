import { renderPackageDescriptions } from "./renderPackageDescriptions.js";

const LONG_DETAILS_THRESHOLD = 650;

// Preserve the definition-list semantics and the sanitized description nodes.
// Only unusually long content gets a disclosure; short fields stay immediately visible.
export function renderInformationFields(
  container,
  fields,
  { live = false, descriptionEntries } = {}
) {
  container.replaceChildren();
  if (!fields.length) return;

  const list = document.createElement("dl");
  if (live) list.className = "dc-information-fields";

  for (const [label, value] of fields) {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.className = "dc-assignment-text";

    if (live && label === "Details") {
      renderPackageDescriptions(description, descriptionEntries, value);
      if (description.textContent.length > LONG_DETAILS_THRESHOLD) {
        const disclosure = document.createElement("details");
        disclosure.className = "dc-information-fields__disclosure";
        const summary = document.createElement("summary");
        summary.textContent = "Full details";
        const content = document.createElement("div");
        content.className = "dc-information-fields__description";
        // Move already-sanitized nodes rather than reparsing untrusted HTML.
        while (description.firstChild) content.append(description.firstChild);
        disclosure.append(summary, content);
        description.append(disclosure);
      }
    } else {
      description.textContent = value || "Not provided";
    }
    list.append(term, description);
  }
  container.append(list);
}
