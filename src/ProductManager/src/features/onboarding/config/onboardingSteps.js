export const ONBOARDING_FLOW_VERSION = 1;

export const ONBOARDING_STEPS = Object.freeze({
  main: [
    {
      id: "main-product-search",
      title: "Find a Product",
      description: "Use Product search to locate a Product and open it directly on the map.",
      selectors: [
        "[data-onboarding-target='product-search'] input",
        "#main-map-product-search input",
        ".pm-main-map-product-search input",
        ".main-map-product-search input",
      ],
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
      selectors: ["#viewDiv"],
      placement: "left-center",
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
      placement: "left-center",
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
      placement: "left-center",
      behavior: {
        type: "wait-for-collection",
        waitingNextLabel: "Add to Collection",
        waitingNextTitle: "Add a Product to the Collection to continue.",
        readyNextLabel: "Next",
        readyDescription:
          "The Product Collection tray keeps selected Products together. Open the collection in Analyze or Review when you are ready.",
        readySelectors: [".pm-product-collection-tray"],
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
  ],
  dashboard: [
    {
      id: "dashboard-range",
      title: "Set the activity range",
      description:
        "Use a quick range or choose From and To values, then select Apply. Refresh reloads the current range without changing it.",
      selectors: [".pm-dashboard-range-builder", ".pm-dashboard-header__actions"],
      placement: "left",
    },
    {
      id: "dashboard-summary",
      title: "Read the operational summary",
      description:
        "The summary cards show activity volume, affected Products, important changes, available reports and failed operations for the active range.",
      selectors: [".pm-dashboard-summary"],
      placement: "below",
    },
    {
      id: "dashboard-filters",
      title: "Filter the activity list",
      description:
        "Search activity or filter by type, status, importance, reports and Product. The list count shows matching rows against the full result.",
      selectors: [".pm-dashboard-filters"],
      placement: "below",
    },
    {
      id: "dashboard-activity-links",
      title: "Open Product workflows",
      description:
        "Each activity can open Review, Analyze, Product History and available reports. Disabled links mean that content is not available for the activity.",
      selectors: [".pm-dashboard-activity-links", ".pm-dashboard-activity"],
      placement: "left",
    },
    {
      id: "dashboard-breakdowns",
      title: "Use summary panels as filters",
      description:
        "Select a Status or Operation summary row to filter the activity list. Opening History replaces these panels until the History panel is closed.",
      selectors: [".pm-dashboard-grid__aside"],
      placement: "left",
    },
  ],
  analyze: [
    {
      id: "analyze-product-picker",
      title: "Add Products",
      description:
        "Use the Product catalog picker to add one or more Products to the Analyze workspace.",
      selectors: [".analyze-dataset-form", ".analyze-dataset-manager"],
      placement: "right-center",
    },
    {
      id: "analyze-product-list",
      title: "Manage the Product list",
      description:
        "Enable or disable Products without removing them, or remove Products that are no longer needed in the workspace.",
      selectors: [".analyze-dataset-list"],
      placement: "right-center",
    },
    {
      id: "analyze-product-cards",
      title: "Control Product cards",
      description:
        "Open or collapse all Product cards, then expand individual Products to focus on the content you need.",
      selectors: [".analyze-products__actions", ".analyze-products__list"],
      placement: "right-center",
    },
    {
      id: "analyze-reports-history",
      title: "Inspect reports and History",
      description:
        "Each Product card contains metadata, IC-ENC XML, internal validation reports and Product History when the backend provides them.",
      selectors: [".analyze-product-card__content", ".analyze-sidebar__content"],
      placement: "right-center",
    },
  ],
  review: [
    {
      id: "review-product-picker",
      title: "Add Products",
      description:
        "Use the Product catalog picker to add Products directly to the Review workspace.",
      selectors: [".pm-review-product-form", ".pm-review-sidebar"],
      placement: "right-center",
    },
    {
      id: "review-product-list",
      title: "Configure the comparison",
      description:
        "Enable or disable Products and choose which content types each Product should include in the comparison.",
      selectors: [".pm-review-product-list"],
      placement: "right-center",
    },
    {
      id: "review-comparison-board",
      title: "Compare Products side by side",
      description:
        "Enabled Products are shown as parallel columns. Scroll horizontally when the comparison contains more columns than the viewport.",
      selectors: [".pm-review-board__columns", ".pm-review-board"],
      placement: "left-center",
    },
    {
      id: "review-product-content",
      title: "Inspect Product content",
      description:
        "Each column keeps content in a fixed order so History, IC-ENC reports and internal validation can be compared consistently.",
      selectors: [".pm-review-content-card", ".pm-review-column__content", ".pm-review-board"],
      placement: "left-center",
    },
  ],
});

export function getOnboardingSteps(routeName) {
  return ONBOARDING_STEPS[routeName] ?? [];
}
