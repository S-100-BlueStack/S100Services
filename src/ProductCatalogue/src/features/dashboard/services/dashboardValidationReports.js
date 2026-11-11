import { fetchProductArtifacts } from "../../data/api/productArtifactApi.js";
import { selectPackageValidationArtifacts } from "../../products/domain/packageValidationArtifacts.js";
import {
  PRODUCT_CONTENT_TYPE,
  getProductContentConfiguration,
} from "../../products/domain/productContext.js";
import { getDefaultWorkspaceProductService } from "../../products/services/workspaceProductService.js";

export async function fetchDashboardValidationReports(
  datasetName,
  {
    resolveProduct = (name) => getDefaultWorkspaceProductService().resolveProduct(name),
    fetchArtifacts = fetchProductArtifacts,
  } = {}
) {
  const name = String(datasetName ?? "").trim();
  if (!name) throw new Error("The activity does not identify a Product.");

  const resolution = await resolveProduct(name);
  const productContext = resolution?.product;
  if (
    resolution?.status !== "resolved" ||
    productContext?.datasetName?.trim().toUpperCase() !== name.toUpperCase()
  ) {
    throw new Error("The Product could not be resolved for validation reports.");
  }
  const configuration = getProductContentConfiguration(
    productContext,
    PRODUCT_CONTENT_TYPE.INTERNAL_VALIDATION
  );
  if (configuration?.loaderId !== "electronic-artifacts" || configuration?.implemented !== true) {
    throw new Error("Validation downloads are not available for this Product source.");
  }

  const history = await fetchArtifacts(name, { productContext });
  // Use the same exact Product/specification ownership check as package Analyze.
  // An activity's report ID is not evidence that it owns a downloadable artifact.
  const selection = selectPackageValidationArtifacts(history, productContext);
  return {
    reports: selection.artifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.fileName || "Validation file",
      url: artifact.url,
      generatedAt: artifact.createdAtUtc ?? null,
    })),
    hasUnattributedArtifacts: selection.hasUnattributedArtifacts,
  };
}
