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
      id: "main-navigation",
      title: "Move between workspaces",
      description:
        "Dashboard shows activity, Analyze inspects Products, and Review compares them. From the main map, these links open a new tab and leave the map available.",
      selectors: [".header-center"],
      placement: "below",
    },
    {
      id: "main-product-search",
      title: "Find a Product",
      description: "Product search finds loaded active Products and opens the selected Product.",
      selectors: ["[data-onboarding-target='product-search']"],
      placement: "adjacent-horizontal",
    },
    {
      id: "main-locator",
      title: "Find a location",
      description:
        "Locator searches addresses, populated places and postal locations in Denmark and Greenland. Choosing a result moves the map without selecting a Product.",
      selectors: ["#main-map-locator-button"],
      placement: "below",
    },
    {
      id: "main-data-sources",
      title: "Choose Data sources",
      description:
        "Data sources lets you enable or disable Product sources and choose which sources are active on the map.",
      selectors: [".pc-data-source-panel"],
      placement: "left",
      reveal: {
        triggerSelector: "#data-sources-button",
        openSelector: ".pc-data-source-panel",
      },
    },
    {
      id: "main-filters",
      title: "Filter visible Products",
      description:
        "Filters narrow Products by Display scale, Status and Usage band; Idle is excluded by default. The count beside Filters shows active filters.",
      selectors: ["#attribute-filter-panel"],
      placement: "left",
      reveal: {
        triggerSelector: "#filter-button",
        openSelector: "#attribute-filter-panel",
      },
    },
    {
      id: "main-map",
      title: "Inspect Products",
      description:
        "Hover highlights a Product temporarily without changing selection. Click normally to open a Product, or choose from the overlap picker when Products overlap.",
      selectors: ["#viewDiv"],
      placement: "target-top-right",
      highlight: false,
    },
    {
      id: "main-shortcuts",
      title: "Open the highlighted Product",
      description:
        "Optionally Ctrl-click on Windows/Linux or Cmd-click on macOS to open only the current transient highlighted Product. With map focus, Ctrl+Enter / Cmd+Enter does the same; the compact map hint shows both shortcuts.",
      selectors: ["#viewDiv"],
      placement: "target-top-right",
      highlight: false,
    },
    {
      id: "main-popup-actions",
      title: "Use the Product popup",
      description:
        "Click a Product to open its popup, where available actions include Freeze/Unfreeze, Send, Export and Cancel Export. Actions depend on the selected Product.",
      selectors: ["#viewDiv"],
      placement: "target-top-right",
      highlight: false,
    },
    {
      id: "main-product-collection",
      title: "Build a Product Collection",
      description:
        "Use Product Collection in a Product popup to add it to the tray. The tray opens the collection in Analyze or Review.",
      selectors: [".pc-product-collection-tray", "#viewDiv"],
      placement: "target-top-right",
      highlight: false,
    },
    {
      id: "main-preferences",
      title: "Choose your display settings",
      description:
        "Theme switches between Light (sun) and Dark (moon). Scale hiding is an optional Main-map setting and defaults to off.",
      selectors: ["#preferences-panel"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
    {
      id: "main-saved-preferences",
      title: "Remember your preferences",
      description:
        "In Saved preferences, Auto-save remembers changes; turning it off removes the saved value without changing the current setting. Reset restores defaults independently of Auto-save; Start introduction reopens this guide.",
      selectors: [".pc-preferences-panel__group"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
  ],
  dashboard: [
    {
      id: "dashboard-navigation",
      title: "Move between workspaces",
      description:
        "Product Catalogue opens the main map; Dashboard shows activity, Analyze inspects Products, and Review compares them. The current workspace is marked in the navbar.",
      selectors: [".header-center"],
      placement: "below",
    },
    {
      id: "dashboard-range",
      title: "Set the activity range",
      description:
        "Choose From and optional To dates and times; valid committed changes apply automatically.",
      selectors: [".pc-dashboard-range-builder"],
      placement: "below",
    },
    {
      id: "dashboard-refresh",
      title: "Refresh activity",
      description:
        "Refresh reloads the current range. The adjacent time records the last successful load.",
      selectors: [".pc-dashboard-refresh-status"],
      placement: "below",
    },
    {
      id: "dashboard-filters",
      title: "Narrow the activity list",
      description: "Search activity or filter by type, status, importance, reports and Product.",
      selectors: [".pc-dashboard-filters"],
      placement: "below",
    },
    {
      id: "dashboard-sorting",
      title: "Sort activity",
      description: "Select a sortable column heading to change the activity order.",
      selectors: [".pc-dashboard-activity-table"],
      placement: "below",
    },
    {
      id: "dashboard-paging",
      title: "Choose how much to show",
      description: "Use the page controls and page size to browse matching activity.",
      selectors: [".pc-dashboard-pagination"],
      placement: "below",
    },
    {
      id: "dashboard-activity-links",
      title: "Open Product workflows",
      description:
        "When activity rows are available, use the Links column to open History, Analyze, Review and available reports. History appears in the side panel; close it to return to the summaries.",
      selectors: [".pc-dashboard-activity-table"],
      placement: "below",
    },
    {
      id: "dashboard-preferences",
      title: "Choose your display settings",
      description:
        "Theme switches between Light (sun) and Dark (moon). Use Start introduction at the bottom to replay this guide.",
      selectors: ["#preferences-panel"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
    {
      id: "dashboard-saved-preferences",
      title: "Remember your preferences",
      description:
        "In Saved preferences, Auto-save remembers changes; turning it off removes the saved value without changing the current setting. Reset restores defaults independently of Auto-save; Start introduction reopens this guide.",
      selectors: [".pc-preferences-panel__group"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
  ],
  analyze: [
    {
      id: "analyze-navigation",
      title: "Move between workspaces",
      description:
        "Product Catalogue opens the main map; Dashboard shows activity, Analyze inspects Products, and Review compares them. The current workspace is marked in the navbar.",
      selectors: [".header-center"],
      placement: "below",
    },
    {
      id: "analyze-product-picker",
      title: "Add Products",
      description: "Search the Product catalog to add Products to this workspace.",
      selectors: [".analyze-dataset-form"],
      placement: "adjacent-horizontal",
    },
    {
      id: "analyze-product-list",
      title: "Manage Products",
      description:
        "Enable or disable Products without removing them, or remove Products you no longer need.",
      selectors: [".analyze-dataset-list"],
      placement: "adjacent-horizontal",
    },
    {
      id: "analyze-product-cards",
      title: "Explore Product content",
      description:
        "When Products are loaded, open individual Product cards, or use Open all and Collapse all. Cards contain Product metadata, History and available validation content; unavailable content is identified.",
      selectors: [".analyze-products"],
      placement: "adjacent-horizontal",
    },
    {
      id: "analyze-refresh",
      title: "Refresh this workspace",
      description:
        "Use Refresh to reload enabled Products and their content. Workspace data also updates when changes are detected.",
      selectors: [".analyze-workspace-refresh"],
      placement: "adjacent-horizontal",
    },
    {
      id: "analyze-preferences",
      title: "Choose your display settings",
      description:
        "Theme switches between Light (sun) and Dark (moon). Use Start introduction at the bottom to replay this guide.",
      selectors: ["#preferences-panel"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
    {
      id: "analyze-saved-preferences",
      title: "Remember your preferences",
      description:
        "In Saved preferences, Auto-save remembers changes; turning it off removes the saved value without changing the current setting. Reset restores defaults independently of Auto-save; Start introduction reopens this guide.",
      selectors: [".pc-preferences-panel__group"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
  ],
  review: [
    {
      id: "review-navigation",
      title: "Move between workspaces",
      description:
        "Product Catalogue opens the main map; Dashboard shows activity, Analyze inspects Products, and Review compares them. The current workspace is marked in the navbar.",
      selectors: [".header-center"],
      placement: "below",
    },
    {
      id: "review-product-picker",
      title: "Compose your comparison",
      description:
        "Search the Product catalog to add Products. Add more than one to compare them side by side.",
      selectors: [".pc-review-product-form"],
      placement: "adjacent-horizontal",
    },
    {
      id: "review-workspace-content",
      title: "Choose content for all Products",
      description:
        "The Content controls toggle History, IC-ENC and Validation for all Products. A mixed checkbox means individual Products have different choices; unavailable reports remain clearly marked.",
      selectors: [".pc-review-workspace-content"],
      placement: "adjacent-horizontal",
    },
    {
      id: "review-product-list",
      title: "Adjust individual Products",
      description:
        "Products appear in this list when added. Enable or disable a Product without removing it, and use its History, IC-ENC and Validation checkboxes to override the workspace choices.",
      selectors: [".pc-review-product-list"],
      placement: "adjacent-horizontal",
    },
    {
      id: "review-refresh",
      title: "Refresh the comparison",
      description: "Use Refresh beside Products to reload enabled Products and their content.",
      selectors: [".pc-review-product-list__refresh-button"],
      placement: "adjacent-horizontal",
    },
    {
      id: "review-comparison-board",
      title: "Read Product content",
      description:
        "The Review board shows enabled Products side by side when available, with selected content in a consistent order. Scroll within a Product column for more content and across the board for more Products.",
      selectors: [".pc-review-board"],
      placement: "target-top-right",
    },
    {
      id: "review-preferences",
      title: "Choose your display settings",
      description:
        "Theme switches between Light (sun) and Dark (moon). Use Start introduction at the bottom to replay this guide.",
      selectors: ["#preferences-panel"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
      },
    },
    {
      id: "review-saved-preferences",
      title: "Remember your preferences",
      description:
        "In Saved preferences, Auto-save remembers changes; turning it off removes the saved value without changing the current setting. Reset restores defaults independently of Auto-save; Start introduction reopens this guide.",
      selectors: [".pc-preferences-panel__group"],
      placement: "left",
      reveal: {
        triggerSelector: "#preferences-button",
        openSelector: "#preferences-panel",
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
