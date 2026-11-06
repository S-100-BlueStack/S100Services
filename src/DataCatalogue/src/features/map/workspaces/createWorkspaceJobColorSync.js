import { JOB_STORE_CHANGE_TYPE } from "../../jobs/state/jobStore.js";
import { workspaceSelectionKey } from "./pipelineVisibility.js";
import { countOpenJobsByWorkspace } from "./workspaceJobColors.js";

// A pending Jobs read must not erase the last verified colors from existing graphics.
export function createWorkspaceJobColorSync({ publishCounts }) {
  let catalogueKey = null;

  return {
    setCatalogue(workspaces) {
      const key = JSON.stringify([...new Set(workspaces.map(workspaceSelectionKey))].sort());
      if (key === catalogueKey) return;
      catalogueKey = key;
      // Previous counts may belong to Workspaces that are no longer in the catalogue.
      publishCounts(null);
    },
    onJobsChanged(snapshot) {
      if (snapshot.isLoading || snapshot.error) return;
      if (
        snapshot.lastChange?.type !== JOB_STORE_CHANGE_TYPE.JOBS_LOADED &&
        snapshot.lastChange?.type !== JOB_STORE_CHANGE_TYPE.JOB_STATUS_UPDATED
      )
        return;

      publishCounts(countOpenJobsByWorkspace(snapshot.jobs));
    },
  };
}
