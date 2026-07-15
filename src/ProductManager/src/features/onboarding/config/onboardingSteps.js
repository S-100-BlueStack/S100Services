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
    },
    {
      id: "main-popup-actions",
      title: "Use Product actions",
      description:
        "The Product popup contains controls for copying, collecting and running operational actions such as Freeze, Send, Export and Rollback.",
      selectors: [".popup-copy-btn", ".popup-product-collection-btn", ".popup-action-bar"],
      selectorMode: "all",
      placement: "left-center",
    },
    {
      id: "main-product-collection",
      title: "Build a Product Collection",
      description:
        "Use the Product Collection action in the popup. Collected Products can then be opened together in Analyze or Review.",
      selectors: [".popup-product-collection-btn", ".pm-product-collection-tray"],
      placement: "left-center",
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
      id: "dashboard-overview",
      title: "Dashboard overview",
      description:
        "Choose a time range, filter the activity list, use summary rows as filters and open Product History from an activity.",
      selectors: ["#product-dashboard-page", ".pm-dashboard-page"],
      placement: "center",
      highlight: false,
    },
  ],
  analyze: [
    {
      id: "analyze-overview",
      title: "Analyze Products",
      description:
        "Add Products with the catalog picker, enable or disable them in the Product list and inspect metadata, reports and history.",
      selectors: ["#analyze-sidebar-panel", ".analyze-sidebar__content"],
      placement: "right-center",
    },
  ],
  review: [
    {
      id: "review-overview",
      title: "Review Products",
      description:
        "Add Products in the sidebar, choose the content to include and compare Product history in parallel columns.",
      selectors: [".pm-review-sidebar", "#product-review-page", ".pm-review-page"],
      placement: "right-center",
    },
  ],
});

export function getOnboardingSteps(routeName) {
  return ONBOARDING_STEPS[routeName] ?? [];
}
