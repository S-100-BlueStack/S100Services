export const ONBOARDING_FLOW_VERSION = 2;
export const MAIN_ONBOARDING_FLOW_VERSION = 3;

export function getOnboardingFlowVersion(routeName) {
  const normalizedRouteName = String(routeName ?? "main")
    .trim()
    .toLowerCase();
  return normalizedRouteName === "main" ? MAIN_ONBOARDING_FLOW_VERSION : ONBOARDING_FLOW_VERSION;
}

export const ONBOARDING_WELCOME_CONTENT = Object.freeze({
  main: {
    title: "Welcome to Product Catalogue",
    description: "Take a short tour of the main controls and Product workflows.",
  },
  dashboard: {
    title: "Welcome to Dashboard",
    description: "Take a short tour of activity ranges, filters and Product workflows.",
  },
  analyze: {
    title: "Welcome to Analyze",
    description: "Take a short tour of adding Products and reviewing their data and reports.",
  },
  review: {
    title: "Welcome to Product Review",
    description: "Take a short tour of adding Products and comparing them side by side.",
  },
});
export const ONBOARDING_STEPS = Object.freeze({
  main: [
    {
      id: "main-product-search",
      title: "Find Products and locations",
      description:
        "Product search finds loaded active Products and opens the selected Product. Locator searches addresses, populated places and postal locations in Denmark and Greenland; selecting a Locator result only moves the map.",
      selectors: [
        "[data-onboarding-target='product-search'] input",
        "#main-map-product-search input",
        ".pc-main-map-product-search input",
        ".main-map-product-search input",
        "#main-map-locator-button",
      ],
      selectorMode: "all",
      maximumTargets: 2,
      placement: "adjacent-horizontal",
    },
    {
      id: "main-filters",
      title: "Filter visible Products",
      description:
        "Filters narrow the map by Display scale, Status and Usage band. The active count is shown beside the control.",
      selectors: ["#filter-button", ".filter-wrapper"],
      placement: "left",
    },
    {
      id: "main-map",
      title: "Inspect Products on the map",
      description:
        "Select a Product geometry to open its popup. Hover highlights Products without changing the current selection.",
      selectors: [
        "[data-onboarding-target='product-search']",
        "#main-map-product-search",
        ".pc-main-map-product-search",
        ".main-map-product-search",
      ],
      placement: "adjacent-left",
      highlight: false,
      behavior: {
        type: "wait-for-popup",
        waitingNextLabel: "Open a Product",
        waitingNextTitle: "Select a Product on the map to continue.",
        readyNextLabel: "Continue",
      },
    },
    {
      id: "main-popup-actions",
      title: "Use Product actions",
      description:
        "The Product popup contains controls for copying, collecting and running operational actions such as Freeze, Send, Export and Rollback.",
      selectors: [".popup-copy-btn", ".popup-product-collection-btn", ".popup-action-bar"],
      selectorMode: "all",
      positionSelectors: [
        "[data-onboarding-target='product-search']",
        "#main-map-product-search",
        ".pc-main-map-product-search",
        ".main-map-product-search",
      ],
      placement: "adjacent-left",
      behavior: {
        type: "require-popup",
        fallbackStepId: "main-map",
      },
    },
    {
      id: "main-product-collection",
      title: "Build a Product Collection",
      description:
        "Use the highlighted Product Collection action in the popup to add the selected Product.",
      selectors: [".popup-product-collection-btn"],
      positionSelectors: [
        "[data-onboarding-target='product-search']",
        "#main-map-product-search",
        ".pc-main-map-product-search",
        ".main-map-product-search",
      ],
      placement: "adjacent-left",
      behavior: {
        type: "wait-for-collection",
        waitingNextLabel: "Add to Collection",
        waitingNextTitle: "Add a Product to the Collection to continue.",
        readyNextLabel: "Next",
        readyDescription:
          "The Product Collection tray keeps selected Products together. Open the collection in Analyze or Review when you are ready.",
        readySelectors: [".pc-product-collection-tray"],
      },
    },
    {
      id: "main-workspaces",
      title: "Open another workspace",
      description:
        "Dashboard shows operational activity. Analyze inspects Product data and reports. Review compares Product history side by side.",
      selectors: ["[data-nav-dashboard-link]", "[data-nav-analyze-link]", "[data-nav-review-link]"],
      selectorMode: "all",
      placement: "below",
    },
    {
      id: "main-theme",
      title: "Choose your theme",
      description: "Switch between light and dark mode. Your choice can be saved in this browser.",
      selectors: ["#theme-toggle"],
      placement: "below",
    },
    {
      id: "main-preferences",
      title: "Manage your preferences",
      description:
        "Open Preferences to choose which map and display settings are saved in this browser.",
      selectors: ["#preferences-button"],
      placement: "below",
      behavior: {
        type: "wait-for-target-count",
        selectors: ["#preferences-panel:not([hidden])"],
        minimumCount: 1,
        autoAdvance: false,
        waitingNextLabel: "Open Preferences",
        waitingNextTitle: "Open Preferences to continue.",
        readyNextLabel: "Finish",
        readyDescription:
          "Choose which map and display settings are saved in this browser. You can also restart the introduction here at any time.",
        readySelectors: ["#preferences-panel"],
        readyPlacement: "left",
      },
    },
  ],
  dashboard: [
    {
      id: "dashboard-range",
      title: "Set the activity range",
      description:
        "Use a quick range or choose From and To values, then select Apply. Refresh reloads the current range without changing it.",
      selectors: [".pc-dashboard-range-builder", ".pc-dashboard-header__actions"],
      placement: "left",
    },
    {
      id: "dashboard-summary",
      title: "Read the operational summary",
      description:
        "The summary cards show activity volume, affected Products, important changes, available reports and failed operations for the active range.",
      selectors: [".pc-dashboard-summary"],
      placement: "below",
    },
    {
      id: "dashboard-filters",
      title: "Filter the activity list",
      description:
        "Search activity or filter by type, status, importance, reports and Product. The list count shows matching rows against the full result.",
      selectors: [".pc-dashboard-filters"],
      placement: "below",
    },
    {
      id: "dashboard-activity-links",
      title: "Open Product workflows",
      description:
        "Each activity can open Review, Analyze, Product History and available reports. Disabled links mean that content is not available for the activity.",
      selectors: [".pc-dashboard-activity-links", ".pc-dashboard-activity"],
      placement: "left",
    },
    {
      id: "dashboard-breakdowns",
      title: "Use summary panels as filters",
      description:
        "Select a Status or Operation summary row to filter the activity list. Opening History replaces these panels until the History panel is closed.",
      selectors: [".pc-dashboard-grid__aside"],
      placement: "left",
    },
  ],
  analyze: [
    {
      id: "analyze-product-picker",
      title: "Add a Product",
      description: "Search the Product catalog and add a Product to begin the analysis.",
      selectors: [".analyze-dataset-form", ".analyze-dataset-manager"],
      placement: "adjacent-horizontal",
      behavior: {
        type: "wait-for-target-count",
        selectors: [".analyze-product-card"],
        minimumCount: 1,
        autoAdvance: true,
        waitingNextLabel: "Add a Product",
        waitingNextTitle: "Add a Product to continue.",
        readyNextLabel: "Continue",
      },
    },
    {
      id: "analyze-product-list",
      title: "Manage the Product list",
      description:
        "Enable or disable Products without removing them, or remove Products that are no longer needed.",
      selectors: [".analyze-dataset-list"],
      placement: "adjacent-horizontal",
    },
    {
      id: "analyze-product-cards",
      title: "Control Product cards",
      description:
        "Use Open all and Collapse all, or open individual Product cards to focus on the information you need.",
      selectors: [".analyze-products__actions", ".analyze-products__list"],
      selectorMode: "all",
      placement: "adjacent-horizontal",
      behavior: {
        type: "require-target-count",
        selectors: [".analyze-product-card"],
        minimumCount: 1,
        fallbackStepId: "analyze-product-picker",
      },
    },
    {
      id: "analyze-reports-history",
      title: "Inspect Product information",
      description:
        "Open a Product card to review edition, update, status, reports and Product History. Unavailable sections are shown clearly.",
      selectors: [".analyze-product-card__content", ".analyze-product-card"],
      placement: "adjacent-horizontal",
      behavior: {
        type: "require-target-count",
        selectors: [".analyze-product-card"],
        minimumCount: 1,
        fallbackStepId: "analyze-product-picker",
      },
    },
  ],
  review: [
    {
      id: "review-product-picker",
      title: "Add two Products",
      description:
        "Add at least two Products so you can compare them side by side in Product Review.",
      selectors: [".pc-review-product-form", ".pc-review-sidebar"],
      placement: "adjacent-horizontal",
      behavior: {
        type: "wait-for-target-count",
        selectors: [".pc-review-column"],
        minimumCount: 2,
        autoAdvance: true,
        waitingNextLabel: "Add two Products",
        waitingNextTitle: "Add at least two Products to continue.",
        readyNextLabel: "Continue",
      },
    },
    {
      id: "review-product-list",
      title: "Configure the comparison",
      description:
        "Enable or disable Products and choose which content types each Product should include.",
      selectors: [".pc-review-product-list"],
      placement: "adjacent-horizontal",
    },
    {
      id: "review-comparison-board",
      title: "Compare Products side by side",
      description:
        "The highlighted Product columns make it easier to compare the same information across Products.",
      selectors: [".pc-review-column"],
      selectorMode: "all",
      maximumTargets: 2,
      placement: "target-top-right",
      behavior: {
        type: "require-target-count",
        selectors: [".pc-review-column"],
        minimumCount: 2,
        fallbackStepId: "review-product-picker",
      },
    },
    {
      id: "review-product-content",
      title: "Inspect Product content",
      description:
        "Each Product column keeps History and available reports in the same order for easier comparison.",
      selectors: [".pc-review-column__content", ".pc-review-column"],
      selectorMode: "all",
      maximumTargets: 2,
      placement: "target-top-right",
      behavior: {
        type: "require-target-count",
        selectors: [".pc-review-column"],
        minimumCount: 2,
        fallbackStepId: "review-product-picker",
      },
    },
  ],
});
export function getOnboardingSteps(routeName) {
  return ONBOARDING_STEPS[routeName] ?? [];
}

export function getOnboardingWelcomeContent(routeName) {
  return ONBOARDING_WELCOME_CONTENT[routeName] ?? ONBOARDING_WELCOME_CONTENT.main;
}
