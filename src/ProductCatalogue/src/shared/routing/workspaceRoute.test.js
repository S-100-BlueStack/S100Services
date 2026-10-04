import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildWorkspaceUrl, parseWorkspaceRoute, setWorkspaceRouteUrl } from "./workspaceRoute.js";
import { getCurrentRoute as getAppRoute } from "../../app/routing/appRoute.js";
import { buildAnalyzeUrl, getCurrentRoute } from "../../features/analyze/routing/analyzeRoute.js";
import {
  buildReviewUrl,
  getCurrentReviewRoute,
} from "../../features/review/routing/reviewRoute.js";
import {
  addAnalyzeDatasetItem,
  createAnalyzeDatasetItems,
  getEnabledAnalyzeDatasetNames,
  removeAnalyzeDatasetItem,
  toggleAnalyzeDatasetItem,
} from "../../features/analyze/domain/analyzeDatasetList.js";
import {
  addReviewProductItem,
  createReviewProductItems,
  getEnabledReviewDatasetNames,
  removeReviewProductItem,
} from "../../features/review/domain/reviewProductList.js";
import { validateProductCatalogSelection } from "../../features/products/domain/productCatalog.js";

const origin = "https://catalogue.example";
const options = { origin, baseUrl: "/" };

function browser(t, path) {
  const previous = globalThis.window;
  const calls = [];
  const history = { state: { retained: true } };
  const fake = { location: new URL(path, origin), history };
  for (const method of ["replaceState", "pushState"]) {
    history[method] = (state, _title, url) => {
      calls.push({ method, state, url });
      history.state = state;
      fake.location = new URL(url, origin);
    };
  }
  globalThis.window = fake;
  t.after(() => {
    globalThis.window = previous;
  });
  return calls;
}

for (const name of ["analyze", "review"]) {
  const path = name === "analyze" ? "/Analyze" : "/Review";
  test(`${name} serializes one Product and stable deduplicated multiple Products`, () => {
    assert.equal(buildWorkspaceUrl(name, ["ProductA"], options), `${path}?Datasets=ProductA`);
    const url = new URL(
      buildWorkspaceUrl(name, [" ProductB ", "ProductA", "productb", "", null], options),
      origin
    );
    assert.equal(url.pathname, path);
    assert.equal(url.searchParams.get("Datasets"), "ProductB,ProductA");
    assert.deepEqual([...url.searchParams.keys()], ["Datasets"]);
    assert.deepEqual(parseWorkspaceRoute(url, options).datasetNames, ["ProductB", "ProductA"]);
  });

  test(`${name} round trips reserved characters without double decoding`, () => {
    const names = ["A&B", "C+D", "E/F", "G?H#I", "J=K%20", "Æ Ø:;@!$'()[]"];
    const url = buildWorkspaceUrl(name, names, options);
    assert.deepEqual(parseWorkspaceRoute(url, options).datasetNames, names);
    assert.equal(new URL(url, origin).hash, "");
    const validation = validateProductCatalogSelection(
      names,
      parseWorkspaceRoute(url, options).datasetNames
    );
    assert.deepEqual(validation.valid, names);
    assert.deepEqual(validation.unknown, []);
  });

  test(`${name} parses canonical direct loads and missing or empty Products`, () => {
    for (const search of ["", "?Datasets=", "?Datasets=,,%20,,"]) {
      assert.deepEqual(parseWorkspaceRoute(path + search, options), { name, datasetNames: [] });
    }
    assert.deepEqual(parseWorkspaceRoute(`${path}?Datasets=B,A,B,,`, options).datasetNames, [
      "B",
      "A",
    ]);
    assert.deepEqual(parseWorkspaceRoute(`${path}/OLD?Datasets=NEW`, options).datasetNames, [
      "NEW",
    ]);
  });

  test(`${name} legacy migration replaces history once with safe decoding`, (t) => {
    const calls = browser(t, `${path}/B&A%26C&B&bad%ZZ?keep=yes#section`);
    const route = getAppRoute();
    assert.deepEqual(route, { name, datasetNames: ["B", "A&C", "bad%ZZ"] });
    setWorkspaceRouteUrl(name, route.datasetNames);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "replaceState");
    assert.equal(calls[0].state.retained, true);
    assert.equal(window.location.pathname, path);
    assert.equal(window.location.searchParams.get("keep"), "yes");
    assert.equal(window.location.hash, "#section");
    assert.deepEqual(getAppRoute(), route);
    assert.deepEqual(name === "analyze" ? getCurrentRoute() : getCurrentReviewRoute(), route);
    setWorkspaceRouteUrl(name, route.datasetNames);
    assert.equal(calls.length, 1);
  });

  test(`${name} honors deployment base paths without matching sibling prefixes`, () => {
    const baseOptions = { origin, baseUrl: "/catalogue/" };
    const url = buildWorkspaceUrl(name, ["A"], baseOptions);
    assert.equal(url, `/catalogue${path}?Datasets=A`);
    assert.deepEqual(parseWorkspaceRoute(url, baseOptions), { name, datasetNames: ["A"] });
    assert.equal(parseWorkspaceRoute(`/catalogue-other${path}?Datasets=A`, baseOptions), null);
  });

  test(`${name} comma-bearing legacy identity is not rewritten into other Products`, (t) => {
    const calls = browser(t, `${path}/A%2CB&C`);
    const route = getAppRoute();
    assert.deepEqual(route.datasetNames, ["A,B", "C"]);
    assert.equal(buildWorkspaceUrl(name, route.datasetNames, options), null);
    assert.equal(setWorkspaceRouteUrl(name, route.datasetNames), false);
    assert.equal(calls.length, 0);
  });
}

test("Analyze picker mutations keep a reloadable active set", (t) => {
  const calls = browser(t, "/Analyze?Datasets=B");
  let items = createAnalyzeDatasetItems(getAppRoute().datasetNames);
  items = addAnalyzeDatasetItem(items, "A&B");
  items = addAnalyzeDatasetItem(items, "a&b");
  setWorkspaceRouteUrl("analyze", getEnabledAnalyzeDatasetNames(items));
  assert.deepEqual(getAppRoute().datasetNames, ["B", "A&B"]);
  items = toggleAnalyzeDatasetItem(items, items[0].id, false);
  setWorkspaceRouteUrl("analyze", getEnabledAnalyzeDatasetNames(items));
  assert.deepEqual(getAppRoute().datasetNames, ["A&B"]);
  items = removeAnalyzeDatasetItem(items, items[1].id);
  setWorkspaceRouteUrl("analyze", getEnabledAnalyzeDatasetNames(items));
  assert.deepEqual(getAppRoute().datasetNames, []);
  assert.ok(calls.every((call) => call.method === "replaceState"));
});

test("Review picker mutations preserve order without extra history", (t) => {
  const calls = browser(t, "/Review?Datasets=B");
  let items = createReviewProductItems(getAppRoute().datasetNames);
  items = addReviewProductItem(items, "A");
  items = addReviewProductItem(items, "a");
  setWorkspaceRouteUrl("review", getEnabledReviewDatasetNames(items));
  assert.deepEqual(getAppRoute().datasetNames, ["B", "A"]);
  items = removeReviewProductItem(items, items[0].id);
  setWorkspaceRouteUrl("review", getEnabledReviewDatasetNames(items));
  assert.deepEqual(getAppRoute().datasetNames, ["A"]);
  setWorkspaceRouteUrl("review", getEnabledReviewDatasetNames(items));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.method === "replaceState"));
  setWorkspaceRouteUrl("review", ["C"], { replace: false });
  assert.equal(calls[2].method, "pushState");
});

test("shared navigation helpers used by Collection and Dashboard emit canonical links", (t) => {
  browser(t, "/");
  assert.equal(buildAnalyzeUrl(["B", "A", "B"]), "/Analyze?Datasets=B%2CA");
  assert.equal(buildReviewUrl(["B", "A", "B"]), "/Review?Datasets=B%2CA");
  // Public integration boundary: producers must delegate serialization to the feature helpers.
  for (const path of [
    "features/productCollection/ui/productCollectionTray.js",
    "features/dashboard/ui/dashboardPage.js",
    "features/layout/services/navbarLoader.js",
  ]) {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
    assert.match(source, /buildAnalyzeUrl\(/);
    assert.match(source, /buildReviewUrl\(/);
    assert.doesNotMatch(source, /getAppUrl\("(?:analyze|review)\//);
  }
});
