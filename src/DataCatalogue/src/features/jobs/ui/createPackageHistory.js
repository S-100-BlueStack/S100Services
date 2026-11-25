import { PACKAGE_HISTORY_PREVIEW_ENTRIES } from "../mock/packageHistoryPreviewData.js";

export function createPackageHistoryPreview() {
  const element = document.createElement("section");
  element.className = "job-details__section package-history";
  element.setAttribute("aria-label", "History design preview");

  const header = document.createElement("div");
  header.className = "package-history__header";
  header.append(
    createTextElement("h4", "job-details__section-title", "History"),
    createTextElement("span", "package-history__preview-label", "Design preview")
  );

  const notice = createTextElement(
    "p",
    "package-history__notice",
    "Package history is not available yet. These fictional examples are not events for this Package."
  );
  const scrollElement = createPackageHistoryList(PACKAGE_HISTORY_PREVIEW_ENTRIES, {
    label: "Example Package history, newest first",
  });

  element.append(header, notice, scrollElement);
  return { element, scrollElement };
}

// A read-only presentation component: a future history adapter supplies already
// ordered, formatted entries. These fields are not an API contract.
export function createPackageHistoryList(entries, { label }) {
  const scrollElement = document.createElement("div");
  scrollElement.className = "package-history__scroll";
  scrollElement.tabIndex = 0;
  scrollElement.setAttribute("role", "region");
  scrollElement.setAttribute("aria-label", label);

  const list = document.createElement("ol");
  list.className = "package-history__list";
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "package-history__entry";

    const time = createTextElement("time", "package-history__time", entry.timeLabel);
    time.dateTime = entry.dateTime;
    item.append(
      time,
      createTextElement("p", "package-history__event", entry.title),
      createTextElement("p", "package-history__actor", entry.actor)
    );
    if (entry.context) {
      item.append(createTextElement("p", "package-history__context", entry.context));
    }
    list.append(item);
  }

  scrollElement.append(list);
  return scrollElement;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}
