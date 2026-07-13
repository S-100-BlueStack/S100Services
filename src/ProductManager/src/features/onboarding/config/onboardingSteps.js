export const ONBOARDING_FLOW_VERSION = 1;

export const ONBOARDING_STEPS = Object.freeze({
  main: [
    {
      id: "main-product-search",
      title: "Find a Product",
      description: "Use Product search to locate a Product and open it directly on the map.",
      selectors: [
        "[data-onboarding-target='product-search']",
        "#main-map-product-search",
        ".pm-main-map-product-search",
        ".main-map-product-search",
      ],
    },
    {
      id: "main-filters",
      title: "Filter visible Products",
      description:
        "Filters narrow the map by Display scale, Status and Usage band. The active count is shown beside the control.",
      selectors: ["#filter-button"],
    },
    {
      id: "main-map",
      title: "Inspect Products on the map",
      description:
        "Select a Product geometry to open its popup. Hover highlights Products without changing the current selection.",
      selectors: ["#viewDiv"],
    },
    {
      id: "main-popup-actions",
      title: "Use Product actions",
      description:
        "The Product popup contains operational actions such as Freeze, Send, Export and Rollback. Availability depends on the Product state.",
      selectors: [".popup-action-bar", ".esri-popup"],
    },
    {
      id: "main-product-collection",
      title: "Build a Product Collection",
      description:
        "Add Products from their popup to build a temporary collection, then open the selected Products in Analyze or Review.",
      selectors: [".pm-product-collection-tray", "[data-nav-analyze-link]"],
    },
    {
      id: "main-workspaces",
      title: "Open another workspace",
      description:
        "Dashboard shows operational activity. Analyze inspects Product data and reports. Review compares Product history side by side.",
      selectors: ["#header .header-center"],
    },
  ],
  dashboard: [
    {
      id: "dashboard-overview",
      title: "Dashboard overview",
      description:
        "Choose a time range, filter the activity list, use summary rows as filters and open Product History from an activity.",
      selectors: ["#product-dashboard-page", ".pm-dashboard-page"],
    },
  ],
  analyze: [
    {
      id: "analyze-overview",
      title: "Analyze Products",
      description:
        "Add Products with the catalog picker, enable or disable them in the Product list and inspect metadata, reports and history.",
      selectors: ["#analyze-sidebar-panel", ".analyze-sidebar__content"],
    },
  ],
  review: [
    {
      id: "review-overview",
      title: "Review Products",
      description:
        "Add Products in the sidebar, choose the content to include and compare Product history in parallel columns.",
      selectors: ["#product-review-page", ".pm-review-page"],
    },
  ],
});

export function getOnboardingSteps(routeName) {
  return ONBOARDING_STEPS[routeName] ?? [];
}
