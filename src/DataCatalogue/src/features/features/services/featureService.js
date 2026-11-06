import { pageItems, matchesFeature } from "../domain/featureQuery.js";
import { FEATURE_COUNT, featureSummary, featureDetail } from "../mock/mockFeatures.js";
export function createFeatureService({ run, assignments }) {
  return {
    search(query = {}) {
      return run("features", () => {
        const status = assignments.statuses();
        const summaries = Array.from({ length: FEATURE_COUNT }, (_, index) => {
          const summary = featureSummary(index);
          return { ...summary, status: status(summary.id) };
        });
        return pageItems(
          summaries.filter((feature) => matchesFeature(feature, query)),
          query
        );
      });
    },
    get(id) {
      return run("feature", () => featureDetail(id));
    },
  };
}
