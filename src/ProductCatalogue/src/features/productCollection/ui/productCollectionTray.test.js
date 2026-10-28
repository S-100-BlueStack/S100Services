import assert from "node:assert/strict";
import test from "node:test";

import { launchWorkspaceUrl } from "../../../app/routing/workspaceNavigation.js";
import { buildAnalyzeUrl } from "../../analyze/routing/analyzeRoute.js";
import { buildReviewUrl } from "../../review/routing/reviewRoute.js";
import { openCollectionUrl } from "./productCollectionTray.js";

test("successful Collection launches preserve canonical Analyze and Review composition", (t) => {
  installWindow(t);
  const openedUrls = [];
  const notices = [];
  const datasetNames = [" ProductB ", "A&B", "productb", "C+D"];
  const launch = (url, destinationRoute) =>
    launchWorkspaceUrl(url, destinationRoute, {
      currentRoute: { name: "main" },
      openWindow(openedUrl) {
        openedUrls.push(openedUrl);
        return { opener: {} };
      },
    });
  const showError = (...args) => notices.push(args);

  assert.equal(
    openCollectionUrl(buildAnalyzeUrl(datasetNames), "analyze", "Analyze page was blocked", {
      launch,
      showError,
    }),
    true
  );
  assert.equal(
    openCollectionUrl(buildReviewUrl(datasetNames), "review", "Product Review page was blocked", {
      launch,
      showError,
    }),
    true
  );

  assert.deepEqual(openedUrls, [
    "/Analyze?Datasets=ProductB%2CA%26B%2CC%2BD",
    "/Review?Datasets=ProductB%2CA%26B%2CC%2BD",
  ]);
  assert.deepEqual(notices, []);
});

test("Collection reports only an actually failed new-tab launch", (t) => {
  installWindow(t);
  const notices = [];
  const showError = (...args) => notices.push(args);
  const launch = (url, destinationRoute) =>
    launchWorkspaceUrl(url, destinationRoute, {
      currentRoute: { name: "main" },
      openWindow: () => null,
    });

  assert.equal(
    openCollectionUrl("/Review?Datasets=A", "review", "Product Review page was blocked", {
      launch,
      showError,
    }),
    false
  );
  assert.deepEqual(notices, [
    ["Product Review page was blocked", "Allow popups for this site and try again."],
  ]);
});

test("Collection handles a thrown open attempt without mutating its route input", (t) => {
  installWindow(t);
  const notices = [];
  const url = "/Analyze?Datasets=A%26B%2CC%2BD";
  const launch = (destination, destinationRoute) =>
    launchWorkspaceUrl(destination, destinationRoute, {
      currentRoute: { name: "main" },
      openWindow() {
        throw new Error("open failed");
      },
    });

  assert.equal(
    openCollectionUrl(url, "analyze", "Analyze page was blocked", {
      launch,
      showError: (...args) => notices.push(args),
    }),
    false
  );
  assert.equal(url, "/Analyze?Datasets=A%26B%2CC%2BD");
  assert.equal(notices.length, 1);
  assert.equal(notices[0][0], "Analyze page was blocked");
});

test("same-tab Collection navigation does not attempt or report a popup", (t) => {
  installWindow(t);
  const sameTabUrls = [];
  const notices = [];
  const launch = (url, destinationRoute) =>
    launchWorkspaceUrl(url, destinationRoute, {
      currentRoute: { name: "dashboard" },
      openWindow() {
        throw new Error("popup path must not run");
      },
      navigateSameTab(destination) {
        sameTabUrls.push(destination);
      },
    });

  assert.equal(
    openCollectionUrl("/Analyze?Datasets=A", "analyze", "Analyze page was blocked", {
      launch,
      showError: (...args) => notices.push(args),
    }),
    true
  );
  assert.deepEqual(sameTabUrls, ["/Analyze?Datasets=A"]);
  assert.deepEqual(notices, []);
});

function installWindow(t) {
  const previousWindow = globalThis.window;
  globalThis.window = {
    location: new URL("https://catalogue.example/"),
  };
  t.after(() => {
    globalThis.window = previousWindow;
  });
}
