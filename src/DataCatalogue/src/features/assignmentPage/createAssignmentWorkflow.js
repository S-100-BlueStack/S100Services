import { createLiveAssignmentServices } from "../assignments/services/liveAssignmentServices.js";
import { createUnavailableCatalogueMap } from "../map/assignment/createUnavailableCatalogueMap.js";
import { createAssignmentPage } from "./ui/createAssignmentPage.js";
import { createPrototypeServices } from "../assignments/services/createPrototypeServices.js";
import { createAssignmentMap } from "../map/assignment/createAssignmentMap.js";

export function createAssignmentWorkflow(runtimeConfig, catalogue) {
  return createAssignmentPage({
    services:
      runtimeConfig.sourceMode === "live"
        ? createLiveAssignmentServices(catalogue)
        : createPrototypeServices(),
    createMap:
      runtimeConfig.sourceMode === "live" ? createUnavailableCatalogueMap : createAssignmentMap,
    runtimeConfig,
  });
}
