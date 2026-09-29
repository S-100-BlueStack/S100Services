import { createAssignmentPage } from "./ui/createAssignmentPage.js";
import { createPrototypeServices } from "../assignments/services/createPrototypeServices.js";
import { createAssignmentMap } from "../map/assignment/createAssignmentMap.js";

export function createAssignmentWorkflow(runtimeConfig) {
  return createAssignmentPage({
    services: createPrototypeServices(),
    createMap: createAssignmentMap,
    runtimeConfig,
  });
}
