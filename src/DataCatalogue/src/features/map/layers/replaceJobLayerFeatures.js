import { JOB_LAYER_FIELD } from "./jobLayerFeatureData.js";

export async function replaceJobLayerFeatures({
  layer,
  featureData,
  createGraphics,
  shouldApply = () => true,
} = {}) {
  if (!shouldApply()) {
    return;
  }

  await layer.load();

  if (!shouldApply()) {
    return;
  }

  const query = layer.createQuery();
  query.where = "1=1";
  query.outFields = [JOB_LAYER_FIELD.OBJECT_ID];
  query.returnGeometry = false;

  const featureSet = await layer.queryFeatures(query);

  if (!shouldApply()) {
    return;
  }

  const deleteFeatures = featureSet.features ?? [];
  const addFeatures = createGraphics(featureData);

  if (deleteFeatures.length === 0 && addFeatures.length === 0) {
    return;
  }

  // The queue owns edit ordering. Check freshness immediately before submitting edits.
  if (!shouldApply()) {
    return;
  }

  const editsResult = await layer.applyEdits({ deleteFeatures, addFeatures });
  const failedEdit = [
    ...(editsResult.addFeatureResults ?? []),
    ...(editsResult.deleteFeatureResults ?? []),
  ].find((result) => result.error);

  if (failedEdit) {
    throw new Error(failedEdit.error?.message || "Package layer edits failed.");
  }
}
