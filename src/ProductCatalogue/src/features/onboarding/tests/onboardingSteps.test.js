import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ONBOARDING_STEPS,
  getOnboardingFlowVersion,
  getOnboardingSteps,
  getOnboardingWelcomeContent,
} from "../config/onboardingSteps.js";
import { calculatePopoverPosition } from "../ui/onboardingUi.js";

const expected = {
  main: [
    "navigation",
    "product-search",
    "locator",
    "data-sources",
    "filters",
    "map",
    "shortcuts",
    "popup-actions",
    "product-collection",
    "preferences",
    "saved-preferences",
  ],
  dashboard: [
    "navigation",
    "range",
    "refresh",
    "filters",
    "sorting",
    "paging",
    "activity-links",
    "preferences",
    "saved-preferences",
  ],
  analyze: [
    "navigation",
    "product-picker",
    "product-list",
    "product-cards",
    "refresh",
    "preferences",
    "saved-preferences",
  ],
  review: [
    "navigation",
    "product-picker",
    "workspace-content",
    "product-list",
    "refresh",
    "comparison-board",
    "preferences",
    "saved-preferences",
  ],
};

for (const [route, suffixes] of Object.entries(expected)) {
  test(`${route} has deterministic, non-blocking route-specific coverage`, () => {
    const steps = getOnboardingSteps(route);
    assert.deepEqual(
      steps.map((step) => step.id),
      suffixes.map((id) => `${route}-${id}`)
    );
    assert.match(getOnboardingWelcomeContent(route).title, /Welcome/);
    for (const step of steps) {
      assert.ok(step.title && step.description && step.selectors.length);
      assert.equal(step.behavior, undefined);
      assert.doesNotMatch(step.selectors.join(" "), /nth-child|shadow| input|theme-toggle/);
      assert.doesNotMatch(
        step.description,
        /Apply button|preset|Since yesterday|Last 7 days|localStorage|backend|generation/i
      );
    }
    const copy = steps.map((step) => step.description).join(" ");
    assert.match(copy, /Light \(sun\).*Dark \(moon\)/);
    assert.match(copy, /Auto-save/);
    assert.match(copy, /Reset restores defaults independently/);
    assert.match(copy, /Start introduction/);
    if (route !== "main") {
      assert.doesNotMatch(copy, /Scale hiding|Ctrl|Cmd/);
      assert.doesNotMatch(
        steps.flatMap((step) => step.selectors).join(" "),
        /viewDiv|filter-button|data-sources|product-search|locator|popup/
      );
    }
  });
}

test("preserves route completion versions and rejects unknown route steps", () => {
  assert.equal(getOnboardingFlowVersion("main"), 3);
  for (const route of ["dashboard", "analyze", "review"])
    assert.equal(getOnboardingFlowVersion(route), 2);
  assert.deepEqual(getOnboardingSteps("unknown"), []);
  const ids = Object.values(ONBOARDING_STEPS)
    .flat()
    .map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("separates Product search and Locator and teaches the accepted direct-selection shortcut", () => {
  const steps = getOnboardingSteps("main");
  assert.match(
    steps.find((step) => step.id === "main-product-search").description,
    /loaded active Products/
  );
  assert.match(
    steps.find((step) => step.id === "main-locator").description,
    /without selecting a Product/
  );
  assert.match(
    steps.find((step) => step.id === "main-map").description,
    /Click normally.*overlap picker/
  );
  const shortcut = steps.find((step) => step.id === "main-shortcuts").description;
  assert.match(shortcut, /Ctrl-click on Windows\/Linux.*Cmd-click on macOS/);
  assert.match(shortcut, /current transient highlighted Product/);
  assert.match(shortcut, /map focus, Ctrl\+Enter \/ Cmd\+Enter/);
  assert.match(shortcut, /compact map hint/);
  assert.doesNotMatch(shortcut, /Collection/);
  assert.match(steps[0].description, /new tab/);

  const dataSourceStep = steps.find((step) => step.id === "main-data-sources");
  assert.match(dataSourceStep.description, /enable or disable Product sources/);
  assert.doesNotMatch(dataSourceStep.description, /at least one|keep .* enabled|must .* enabled/i);
  assert.deepEqual(dataSourceStep.reveal, {
    triggerSelector: "#data-sources-button",
    openSelector: ".pc-data-source-panel",
  });
  assert.deepEqual(dataSourceStep.selectors, [".pc-data-source-panel"]);

  const filterStep = steps.find((step) => step.id === "main-filters");
  assert.deepEqual(filterStep.reveal, {
    triggerSelector: "#filter-button",
    openSelector: "#attribute-filter-panel",
  });
  assert.deepEqual(filterStep.selectors, ["#attribute-filter-panel"]);

  const preferences = steps.find((step) => step.id === "main-preferences");
  assert.match(preferences.description, /Scale hiding.*defaults to off/);
});

test("conditional workspace guidance uses route-stable empty-state anchors", () => {
  const dashboard = getOnboardingSteps("dashboard");
  const analyze = getOnboardingSteps("analyze");
  const review = getOnboardingSteps("review");

  const dashboardLinks = dashboard.find((step) => step.id === "dashboard-activity-links");
  assert.deepEqual(dashboardLinks.selectors, [".pc-dashboard-activity-table"]);
  assert.match(dashboardLinks.description, /When activity rows are available/);

  const analyzeCards = analyze.find((step) => step.id === "analyze-product-cards");
  assert.deepEqual(analyzeCards.selectors, [".analyze-products"]);
  assert.match(analyzeCards.description, /When Products are loaded/);

  const reviewProducts = review.find((step) => step.id === "review-product-list");
  assert.deepEqual(reviewProducts.selectors, [".pc-review-product-list"]);
  assert.match(reviewProducts.description, /Products appear in this list when added/);

  const reviewBoard = review.find((step) => step.id === "review-comparison-board");
  assert.deepEqual(reviewBoard.selectors, [".pc-review-board"]);
  assert.match(reviewBoard.description, /when available/);

  for (const step of [dashboardLinks, analyzeCards, reviewProducts, reviewBoard]) {
    assert.doesNotMatch(
      step.selectors.join(" "),
      /__item|pc-review-column|analyze-product-card|activity-links/
    );
  }
});

test("Preferences guidance opens the real shared panel and targets runtime then saved content", () => {
  for (const route of ["main", "dashboard", "analyze", "review"]) {
    const steps = getOnboardingSteps(route);
    const runtime = steps.find((step) => step.id === `${route}-preferences`);
    const saved = steps.find((step) => step.id === `${route}-saved-preferences`);
    const reveal = { triggerSelector: "#preferences-button", openSelector: "#preferences-panel" };

    assert.deepEqual(runtime.reveal, reveal);
    assert.deepEqual(saved.reveal, reveal);
    assert.deepEqual(runtime.selectors, ["#preferences-panel"]);
    assert.deepEqual(saved.selectors, [".pc-preferences-panel__group"]);
    assert.equal(runtime.placement, "left");
    assert.equal(saved.placement, "left");
  }
});

test("all configured targets exist in authoritative application-owned renderers", async () => {
  const paths = [
    "public/components/navbar.html",
    "index.html",
    "src/features/map/search/mainMapSearchControls.js",
    "src/features/map/locator/mainMapLocator.js",
    "src/features/map/filters/attributeFilterPanel.js",
    "src/features/dataSources/ui/dataSourcePanel.js",
    "src/features/preferences/ui/preferencesPanel.js",
    "src/features/productCollection/ui/productCollectionTray.js",
    "src/features/dashboard/ui/dashboardPage.js",
    "src/features/analyze/ui/analyzeSidebar.js",
    "src/features/review/ui/reviewSidebar.js",
    "src/features/review/ui/reviewBoard.js",
  ];
  const sources = (
    await Promise.all(
      paths.map((path) => readFile(new URL(`../../../../${path}`, import.meta.url), "utf8"))
    )
  ).join("\n");
  for (const step of Object.values(ONBOARDING_STEPS).flat()) {
    const selectors = [
      ...step.selectors,
      ...(step.reveal ? [step.reveal.triggerSelector, step.reveal.openSelector] : []),
    ];
    for (const selector of selectors) {
      if (selector.startsWith("[")) assert.match(sources, /onboardingTarget = "product-search"/);
      else assert.ok(sources.includes(selector.slice(1)), `${step.id}: ${selector}`);
    }
  }
});

test("onboarding import graph cannot initialize main-map or workspace services", async () => {
  const visited = new Set();
  async function visit(url) {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = await readFile(url, "utf8");
    assert.doesNotMatch(source, /@arcgis|@esri|MapView|fetch\(|apiGet|scaleVisibility/);
    for (const [, specifier] of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      assert.ok(specifier.startsWith("."));
      const dependency = new URL(specifier, url);
      assert.ok(dependency.pathname.includes("/features/onboarding/"));
      await visit(dependency);
    }
  }
  await visit(new URL("../services/onboardingService.js", import.meta.url));
});

test("places map guidance to the upper left of Product search", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 640,
      top: 60,
      right: 1080,
      bottom: 100,
      width: 440,
      height: 40,
    },
    placement: "adjacent-left",
    viewportWidth: 1728,
    viewportHeight: 900,
    minimumTop: 68,
  });

  assert.deepEqual(position, {
    centered: false,
    top: 68,
    left: 288,
  });
});
test("keeps an adjacent Product search card on the right when horizontal space exists", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 640,
      top: 60,
      right: 1080,
      bottom: 100,
      width: 440,
      height: 40,
    },
    placement: "adjacent-horizontal",
    viewportWidth: 1728,
    viewportHeight: 900,
    minimumTop: 68,
  });
  assert.deepEqual(position, {
    centered: false,
    top: 68,
    left: 1092,
  });
});
test("uses the left side when an adjacent card has no room on the right", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 1120,
      top: 60,
      right: 1600,
      bottom: 100,
      width: 480,
      height: 40,
    },
    placement: "adjacent-horizontal",
    viewportWidth: 1728,
    viewportHeight: 900,
    minimumTop: 68,
  });

  assert.deepEqual(position, {
    centered: false,
    top: 68,
    left: 768,
  });
});
test("places Review guidance inside the top-right of the highlighted columns", () => {
  const position = calculatePopoverPosition({
    popoverRect: { width: 340, height: 190 },
    targetRect: {
      left: 330,
      top: 70,
      right: 1140,
      bottom: 820,
      width: 810,
      height: 750,
    },
    placement: "target-top-right",
    viewportWidth: 1440,
    viewportHeight: 900,
    minimumTop: 62,
  });
  assert.deepEqual(position, {
    centered: false,
    top: 82,
    left: 788,
  });
});

test("workspace guidance reflects automatic ranges, current content controls and refresh", () => {
  const descriptions = (route) =>
    getOnboardingSteps(route)
      .map((step) => step.description)
      .join(" ");
  assert.match(descriptions("dashboard"), /valid committed changes apply automatically/);
  assert.match(descriptions("dashboard"), /last successful load/);
  assert.match(descriptions("dashboard"), /sortable column/);
  assert.match(descriptions("dashboard"), /page size/);
  assert.doesNotMatch(
    getOnboardingSteps("dashboard").find((step) => step.id === "dashboard-filters").description,
    /summary row/
  );
  assert.match(descriptions("analyze"), /Open all and Collapse all/);
  assert.match(descriptions("analyze"), /Refresh.*enabled Products/);
  assert.match(descriptions("review"), /History, IC-ENC and Validation for all Products/);
  assert.match(descriptions("review"), /override the workspace choices/);
  assert.match(descriptions("review"), /Scroll within a Product column/);
});

test("places below-target guidance above a low control when it fits there", () => {
  assert.deepEqual(
    calculatePopoverPosition({
      popoverRect: { width: 300, height: 180 },
      targetRect: { left: 15, right: 310, top: 420, bottom: 455, width: 295, height: 35 },
      placement: "below",
      viewportWidth: 340,
      viewportHeight: 480,
      minimumTop: 60,
    }),
    { centered: false, top: 228, left: 15 }
  );
});
