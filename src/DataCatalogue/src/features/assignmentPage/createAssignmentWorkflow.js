import { createLiveAssignmentServices } from "../assignments/services/liveAssignmentServices.js";
import { createAssignmentMapFactory } from "../map/assignment/createAssignmentMapFactory.js";
import { createLiveCatalogueMap } from "../map/assignment/createLiveCatalogueMap.js";
import { createAssignmentPage } from "./ui/createAssignmentPage.js";
import { createPrototypeServices } from "../assignments/services/createPrototypeServices.js";
import { createAssignmentMap } from "../map/assignment/createAssignmentMap.js";

export function createAssignmentWorkflow(
  runtimeConfig,
  catalogue,
  { onPackageSelected, basemapSettings } = {}
) {
  return createAssignmentPage({
    services:
      runtimeConfig.sourceMode === "live"
        ? createLiveAssignmentServices(catalogue)
        : createPrototypeServices(),
    createMap: createAssignmentMapFactory({
      sourceMode: runtimeConfig.sourceMode,
      catalogue,
      liveMap: createLiveCatalogueMap,
      mockMap: createAssignmentMap,
    }),
    runtimeConfig,
    basemapSettings,
    onPackageSelected,
  });
}
