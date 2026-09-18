import {
  PRODUCT_CONTENT_TYPE,
  getProductContentConfiguration,
} from "../../products/domain/productContext.js";

export const REVIEW_CONTENT_PRESENTATION_STATE = Object.freeze({
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
  EMPTY: "empty",
  CONTENT: "content",
});

export function getReviewHistoryPresentation(product = {}) {
  if (product.error) {
    return createPresentation(REVIEW_CONTENT_PRESENTATION_STATE.FAILED, "Failed", product.error);
  }

  if (!product.history?.endpointAvailable) {
    return createPresentation(
      REVIEW_CONTENT_PRESENTATION_STATE.UNAVAILABLE,
      "Unavailable",
      product.history?.availabilityReason ?? "History is not available for this product."
    );
  }

  const eventCount = Array.isArray(product.history.events) ? product.history.events.length : 0;
  if (eventCount === 0) {
    return createPresentation(
      REVIEW_CONTENT_PRESENTATION_STATE.EMPTY,
      "0 events",
      "No history found for this product."
    );
  }

  return createPresentation(
    REVIEW_CONTENT_PRESENTATION_STATE.CONTENT,
    `${eventCount} event${eventCount === 1 ? "" : "s"}`
  );
}

export function getReviewIcEncPresentation(product = {}) {
  if (!product.productContext && product.error) {
    return createPresentation(REVIEW_CONTENT_PRESENTATION_STATE.FAILED, "Failed", product.error);
  }

  return createPresentation(
    REVIEW_CONTENT_PRESENTATION_STATE.UNAVAILABLE,
    "Unavailable",
    "No IC-ENC reports found for this product."
  );
}

export function getReviewValidationPresentation(product = {}) {
  if (!product.productContext && product.error) {
    return createPresentation(REVIEW_CONTENT_PRESENTATION_STATE.FAILED, "Failed", product.error);
  }

  const configuration = getProductContentConfiguration(
    product.productContext,
    PRODUCT_CONTENT_TYPE.INTERNAL_VALIDATION
  );
  if (!configuration.implemented || configuration.loaderId !== "electronic-artifacts") {
    return createPresentation(
      REVIEW_CONTENT_PRESENTATION_STATE.UNAVAILABLE,
      "Unavailable",
      "No validation reports found for this product."
    );
  }

  if (product.artifactError) {
    return createPresentation(
      REVIEW_CONTENT_PRESENTATION_STATE.FAILED,
      "Failed",
      product.artifactError
    );
  }

  const artifactCount = Array.isArray(product.validationArtifacts)
    ? product.validationArtifacts.length
    : 0;
  if (artifactCount === 0) {
    return createPresentation(
      REVIEW_CONTENT_PRESENTATION_STATE.EMPTY,
      "0 files",
      "No validation reports found for this product."
    );
  }

  return createPresentation(
    REVIEW_CONTENT_PRESENTATION_STATE.CONTENT,
    `${artifactCount} file${artifactCount === 1 ? "" : "s"}`
  );
}

function createPresentation(state, status, message = null) {
  return Object.freeze({ state, status, message });
}
