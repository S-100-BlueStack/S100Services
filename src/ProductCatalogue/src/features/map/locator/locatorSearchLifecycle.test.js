import assert from "node:assert/strict";
import test from "node:test";

import { createLocatorSearchSession, isEventWithinLocatorHost } from "./locatorSearchLifecycle.js";

function createSearchDouble(searchTerm = "") {
  return {
    autoNavigateDisabled: true,
    searchTerm,
    clearCalls: 0,
    clear() {
      this.clearCalls += 1;
      this.searchTerm = "";
    },
  };
}

function ignorePostNavigationClear() {
  return () => {};
}

test("opening a Locator Search session enables native navigation", async () => {
  const search = createSearchDouble("Aalborg");
  const goToCalls = [];
  const view = {
    goTo(target, options) {
      goToCalls.push({ target, options });
      return Promise.resolve();
    },
  };
  const session = createLocatorSearchSession(search, {
    isCurrent: () => true,
    scheduleAfterNavigation: ignorePostNavigationClear(),
  });

  assert.equal(search.autoNavigateDisabled, false);
  await search.goToOverride(view, { target: "Aalborg", options: { animate: false } });
  assert.deepEqual(goToCalls, [{ target: "Aalborg", options: { animate: false } }]);
  assert.equal(session.isActive(), true);
});

test("uses fallback scale only for point navigation targets", async () => {
  const search = createSearchDouble("Aalborg");
  const goToCalls = [];
  const view = {
    goTo(target) {
      goToCalls.push(target);
      return Promise.resolve();
    },
  };
  createLocatorSearchSession(search, {
    isCurrent: () => true,
    fallbackZoomScale: 25000,
    scheduleAfterNavigation: ignorePostNavigationClear(),
  });

  const point = { type: "point", x: 9.92, y: 57.05 };
  const extent = { type: "extent", xmin: 9, ymin: 56, xmax: 10, ymax: 58 };
  await search.goToOverride(view, { target: point });
  await search.goToOverride(view, { target: extent });

  assert.deepEqual(goToCalls, [{ target: point, scale: 25000 }, extent]);
});

test("successful navigation clears completed Search UI and provider state without closing the session", async () => {
  const search = createSearchDouble("Bygaden 57E, 4040 Jyllinge");
  const scheduled = [];
  let providerResetCalls = 0;
  const session = createLocatorSearchSession(search, {
    isCurrent: () => true,
    resetSourceState: () => {
      providerResetCalls += 1;
    },
    scheduleAfterNavigation: (callback) => scheduled.push(callback),
  });

  await search.goToOverride(
    {
      goTo() {
        return Promise.resolve("navigated");
      },
    },
    { target: "Selected address" }
  );

  assert.equal(search.clearCalls, 0);
  assert.equal(providerResetCalls, 0);
  assert.equal(scheduled.length, 1);

  scheduled[0]();

  assert.equal(search.clearCalls, 1);
  assert.equal(providerResetCalls, 1);
  assert.equal(search.searchTerm, "");
  assert.equal(search.autoNavigateDisabled, false);
  assert.equal(session.isActive(), true);
});

test("closing before deferred success cleanup prevents a second clear", async () => {
  const search = createSearchDouble("Aalborg");
  const scheduled = [];
  let providerResetCalls = 0;
  const session = createLocatorSearchSession(search, {
    isCurrent: () => true,
    resetSourceState: () => {
      providerResetCalls += 1;
    },
    scheduleAfterNavigation: (callback) => scheduled.push(callback),
  });

  await search.goToOverride(
    {
      goTo() {
        return Promise.resolve();
      },
    },
    { target: "Aalborg" }
  );

  assert.equal(scheduled.length, 1);
  assert.equal(session.deactivate(), true);
  assert.equal(search.clearCalls, 1);
  assert.equal(providerResetCalls, 1);

  scheduled[0]();

  assert.equal(search.clearCalls, 1);
  assert.equal(providerResetCalls, 1);
});

test("failed navigation does not clear the current Search UI", async () => {
  const search = createSearchDouble("Aalborg");
  const scheduled = [];
  let providerResetCalls = 0;
  createLocatorSearchSession(search, {
    isCurrent: () => true,
    resetSourceState: () => {
      providerResetCalls += 1;
    },
    scheduleAfterNavigation: (callback) => scheduled.push(callback),
  });

  await assert.rejects(
    search.goToOverride(
      {
        goTo() {
          return Promise.reject(new Error("navigation failed"));
        },
      },
      { target: "Aalborg" }
    ),
    /navigation failed/
  );

  assert.equal(scheduled.length, 0);
  assert.equal(search.clearCalls, 0);
  assert.equal(providerResetCalls, 0);
  assert.equal(search.searchTerm, "Aalborg");
});

test("closing a Locator Search session clears Search UI, retires provider state, and blocks stale navigation", async () => {
  const search = createSearchDouble("Aalborg");
  let current = true;
  let providerResetCalls = 0;
  const goToCalls = [];
  const view = {
    goTo(target) {
      goToCalls.push(target);
      return Promise.resolve();
    },
  };
  const session = createLocatorSearchSession(search, {
    isCurrent: () => current,
    resetSourceState: () => {
      providerResetCalls += 1;
    },
    scheduleAfterNavigation: ignorePostNavigationClear(),
  });

  assert.equal(session.deactivate(), true);
  current = false;

  assert.equal(search.autoNavigateDisabled, true);
  assert.equal(search.clearCalls, 1);
  assert.equal(providerResetCalls, 1);
  assert.equal(session.isActive(), false);

  await search.goToOverride(view, { target: "Late Aalborg result" });
  assert.deepEqual(goToCalls, []);
  assert.equal(session.deactivate(), false);
  assert.equal(search.clearCalls, 1);
  assert.equal(providerResetCalls, 1);
});

test("a retired Search session stays blocked after a replacement session becomes current", async () => {
  const oldSearch = createSearchDouble("Old query");
  const newSearch = createSearchDouble("Current query");
  let currentSearch = oldSearch;
  const goToCalls = [];
  const view = {
    goTo(target) {
      goToCalls.push(target);
      return Promise.resolve();
    },
  };

  const oldSession = createLocatorSearchSession(oldSearch, {
    isCurrent: () => currentSearch === oldSearch,
    scheduleAfterNavigation: ignorePostNavigationClear(),
  });
  oldSession.deactivate();

  currentSearch = newSearch;
  createLocatorSearchSession(newSearch, {
    isCurrent: () => currentSearch === newSearch,
    scheduleAfterNavigation: ignorePostNavigationClear(),
  });

  await oldSearch.goToOverride(view, { target: "Stale result" });
  await newSearch.goToOverride(view, { target: "Current result" });

  assert.deepEqual(goToCalls, ["Current result"]);
});

test("close remains fail-closed when Search clear throws", async () => {
  const search = createSearchDouble("Aalborg");
  search.clear = () => {
    throw new Error("clear failed");
  };
  const clearErrors = [];
  const goToCalls = [];
  const session = createLocatorSearchSession(search, {
    isCurrent: () => true,
    onClearError: (error) => clearErrors.push(error),
    scheduleAfterNavigation: ignorePostNavigationClear(),
  });

  assert.equal(session.deactivate(), true);
  assert.equal(search.autoNavigateDisabled, true);
  assert.equal(clearErrors.length, 1);

  await search.goToOverride(
    {
      goTo(target) {
        goToCalls.push(target);
        return Promise.resolve();
      },
    },
    { target: "Stale result" }
  );
  assert.deepEqual(goToCalls, []);
});

test("focus boundary keeps shadow-DOM focus inside and identifies external focus as outside", () => {
  const host = {};
  const shadowInput = {};
  const outsideControl = {};
  const documentNode = {};

  assert.equal(
    isEventWithinLocatorHost({ composedPath: () => [shadowInput, host, documentNode] }, host),
    true
  );
  assert.equal(
    isEventWithinLocatorHost({ composedPath: () => [outsideControl, documentNode] }, host),
    false
  );
});
