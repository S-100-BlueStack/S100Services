import assert from "node:assert/strict";
import test from "node:test";

import {
  REVIEW_CONTENT_PRESENTATION_STATE,
  getReviewHistoryPresentation,
  getReviewIcEncPresentation,
  getReviewValidationPresentation,
} from "./reviewContentPresentation.js";

function createProductContext({ validationImplemented = true } = {}) {
  return {
    contentConfiguration: {
      internalValidation: validationImplemented
        ? {
            visible: true,
            implemented: true,
            loaderId: "electronic-artifacts",
            availabilityReason: null,
          }
        : {
            visible: false,
            implemented: false,
            loaderId: null,
            availabilityReason: "Validation is unavailable for this source.",
          },
    },
  };
}

test("Review History presentation distinguishes unavailable, failed, empty, and content states", () => {
  assert.deepEqual(getReviewHistoryPresentation(), {
    state: REVIEW_CONTENT_PRESENTATION_STATE.UNAVAILABLE,
    status: "Unavailable",
    message: "History is not available for this product.",
  });
  assert.deepEqual(getReviewHistoryPresentation({ error: "History request failed safely." }), {
    state: REVIEW_CONTENT_PRESENTATION_STATE.FAILED,
    status: "Failed",
    message: "History request failed safely.",
  });
  assert.deepEqual(
    getReviewHistoryPresentation({ history: { endpointAvailable: true, events: [] } }),
    {
      state: REVIEW_CONTENT_PRESENTATION_STATE.EMPTY,
      status: "0 events",
      message: "No history found for this product.",
    }
  );
  assert.deepEqual(
    getReviewHistoryPresentation({ history: { endpointAvailable: true, events: [{ id: 1 }] } }),
    {
      state: REVIEW_CONTENT_PRESENTATION_STATE.CONTENT,
      status: "1 event",
      message: null,
    }
  );
});

test("Review IC-ENC presentation remains truthfully unavailable and preserves resolution failures", () => {
  assert.deepEqual(getReviewIcEncPresentation({ productContext: {} }), {
    state: REVIEW_CONTENT_PRESENTATION_STATE.UNAVAILABLE,
    status: "Unavailable",
    message: "No IC-ENC reports found for this product.",
  });
  assert.deepEqual(getReviewIcEncPresentation({ error: "Product resolution failed." }), {
    state: REVIEW_CONTENT_PRESENTATION_STATE.FAILED,
    status: "Failed",
    message: "Product resolution failed.",
  });
});

test("Review Validation presentation distinguishes unavailable, failed, empty, and content states", () => {
  assert.deepEqual(
    getReviewValidationPresentation({
      productContext: createProductContext({ validationImplemented: false }),
    }),
    {
      state: REVIEW_CONTENT_PRESENTATION_STATE.UNAVAILABLE,
      status: "Unavailable",
      message: "No validation reports found for this product.",
    }
  );
  assert.deepEqual(
    getReviewValidationPresentation({
      productContext: createProductContext(),
      artifactError: "Artifact request failed safely.",
    }),
    {
      state: REVIEW_CONTENT_PRESENTATION_STATE.FAILED,
      status: "Failed",
      message: "Artifact request failed safely.",
    }
  );
  assert.deepEqual(
    getReviewValidationPresentation({
      productContext: createProductContext(),
      validationArtifacts: [],
    }),
    {
      state: REVIEW_CONTENT_PRESENTATION_STATE.EMPTY,
      status: "0 files",
      message: "No validation reports found for this product.",
    }
  );
  assert.deepEqual(
    getReviewValidationPresentation({
      productContext: createProductContext(),
      validationArtifacts: [{ fileName: "report.xml" }, { fileName: "summary.txt" }],
    }),
    {
      state: REVIEW_CONTENT_PRESENTATION_STATE.CONTENT,
      status: "2 files",
      message: null,
    }
  );
});
