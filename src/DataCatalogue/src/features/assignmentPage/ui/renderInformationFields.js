import { renderPackageDescriptions } from "./renderPackageDescriptions.js";

// Preserve the definition-list semantics and sanitized description nodes for every field.
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
    } else {
      description.textContent = value || "Not provided";
    }
    list.append(term, description);
  }
  container.append(list);
}
