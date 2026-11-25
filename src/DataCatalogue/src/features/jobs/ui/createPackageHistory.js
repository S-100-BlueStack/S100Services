export function createPackageHistory({ snapshot, onRefresh, onLoadOlder, onRetry }) {
  const element = document.createElement("section");
  element.className = "job-details__section package-history";
  element.setAttribute("aria-label", "Package history");

  const header = document.createElement("div");
  header.className = "package-history__header";
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "package-history__refresh";
  refresh.dataset.jobFocus = "history-refresh";
  refresh.title = "Refresh history";
  refresh.setAttribute("aria-label", "Refresh history");
  const icon = document.createElement("calcite-icon");
  icon.icon = "refresh";
  icon.scale = "s";
  icon.setAttribute("aria-hidden", "true");
  refresh.append(icon);
  refresh.addEventListener("click", () => {
    if (!current.isLoading) onRefresh();
  });
  header.append(createTextElement("h4", "job-details__section-title", "History"), refresh);

  const status = createTextElement("p", "package-history__notice", "");
  status.setAttribute("role", "status");
  const scrollElement = createPackageHistoryList([], { label: "Package history, newest first" });
  scrollElement.dataset.jobFocus = "history";
  const action = document.createElement("calcite-button");
  action.scale = "s";
  action.kind = "neutral";
  action.appearance = "outline";
  action.className = "package-history__more";
  action.dataset.jobFocus = "history-more";
  let current = snapshot;
  let renderedEntries = null;
  action.addEventListener("click", () => {
    if (current.isLoading) return;
    if (current.error) onRetry();
    else if (current.nextBefore) onLoadOlder();
  });
  element.append(header, status, scrollElement, action);

  function update(next) {
    current = next;
    const hasEntries = next.entries.length > 0;
    if (renderedEntries !== next.entries) {
      const scrollTop = scrollElement.scrollTop ?? 0;
      scrollElement.replaceChildren(createHistoryEntries(next.entries));
      scrollElement.scrollTop = scrollTop;
      renderedEntries = next.entries;
    }
    const message = next.isLoading
      ? "Loading Package history..."
      : next.error
        ? `Could not load Package history. ${next.error}${hasEntries ? " Showing previously loaded events." : ""}`
        : next.hasLoaded && !hasEntries
          ? "No history recorded for this Package."
          : "";
    status.textContent = message;
    status.hidden = !message;
    scrollElement.hidden = !hasEntries;
    scrollElement.setAttribute("aria-busy", String(next.isLoading));
    // Keep focused controls mounted while a request runs; do not move focus
    // to the map when the final page removes the continuation control.
    const showAction = next.available && Boolean(next.error || next.nextBefore);
    refresh.hidden = !next.available;
    if (hasEntries) scrollElement.dataset.jobFocus = "history";
    else delete scrollElement.dataset.jobFocus;
    if (showAction) action.dataset.jobFocus = "history-more";
    else delete action.dataset.jobFocus;
    if (!showAction && document.activeElement === action) {
      (hasEntries ? scrollElement : refresh).focus({ preventScroll: true });
    }
    action.hidden = !showAction;
    action.setAttribute("aria-disabled", String(next.isLoading));
    action.textContent = next.error ? "Retry" : "Load older events";
    refresh.setAttribute("aria-disabled", String(next.isLoading));
  }
  update(snapshot);
  return { element, scrollElement, update, packageId: snapshot.packageId };
}

// Display-ready entries are provided by the owning service, never raw event payloads.
export function createPackageHistoryList(entries, { label }) {
  const scrollElement = document.createElement("div");
  scrollElement.className = "package-history__scroll";
  scrollElement.tabIndex = 0;
  scrollElement.setAttribute("role", "region");
  scrollElement.setAttribute("aria-label", label);

  scrollElement.append(createHistoryEntries(entries));
  return scrollElement;
}

function createHistoryEntries(entries) {
  const list = document.createElement("ol");
  list.className = "package-history__list";
  for (const entry of entries) {
    const item = document.createElement("li");
    item.className = "package-history__entry";

    const time = createTextElement("time", "package-history__time", entry.timeLabel);
    time.dateTime = entry.dateTime;
    const actorRow = document.createElement("div");
    actorRow.className = "package-history__actor-row";
    const actor = createTextElement(
      "p",
      "package-history__actor",
      entry.profile?.displayName ? `${entry.profile.displayName} (${entry.actor})` : entry.actor
    );
    if (entry.actorIdentity && entry.actorIdentity !== entry.actor) {
      actor.title = entry.actorIdentity;
    }
    if (entry.actorIdentity && entry.actorIdentity !== "System") {
      const avatar = document.createElement("span");
      avatar.className = "package-history__avatar";
      avatar.setAttribute("aria-hidden", "true");
      const fallback = document.createElement("calcite-icon");
      fallback.icon = "user";
      fallback.scale = "s";
      avatar.append(fallback);
      if (entry.profile?.photoSrc) {
        const image = document.createElement("img");
        image.alt = "";
        image.hidden = true;
        image.addEventListener("load", () => {
          image.hidden = false;
        });
        image.addEventListener("error", () => {
          image.hidden = true;
        });
        image.src = entry.profile.photoSrc;
        avatar.append(image);
      }
      actorRow.append(avatar);
    }
    actorRow.append(actor);
    item.append(time, createTextElement("p", "package-history__event", entry.title), actorRow);
    if (entry.context) {
      item.append(createTextElement("p", "package-history__context", entry.context));
    }
    list.append(item);
  }

  return list;
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}
