import assert from "node:assert/strict";
import test from "node:test";

import { normalizeProductExportMetadata } from "./productExportMetadata.js";

test("normalizes downloadable validation diagnostics for failed exports", () => {
  const metadata = normalizeProductExportMetadata([
    {
      Type: "S100",
      DatasetName: "101DK001",
      ErrorMessage: "SevenCs validation failed.",
      ValidationArtifacts: [
        {
          Id: "d2875e6d-e17e-4cd3-b4a3-23654cc1398a",
          FileName: "101DK001.vld",
          MediaType: "text/plain",
          CreatedAtUtc: "2026-08-14T10:00:00Z",
          Url: "/electronicproducts/101DK001/artifacts/d2875e6d-e17e-4cd3-b4a3-23654cc1398a",
        },
      ],
    },
  ]);

  assert.equal(metadata.items[0].errorMessage, "SevenCs validation failed.");
  assert.deepEqual(metadata.items[0].validationArtifacts, [
    {
      id: "d2875e6d-e17e-4cd3-b4a3-23654cc1398a",
      fileName: "101DK001.vld",
      mediaType: "text/plain",
      createdAtUtc: "2026-08-14T10:00:00Z",
      url: "/electronicproducts/101DK001/artifacts/d2875e6d-e17e-4cd3-b4a3-23654cc1398a",
    },
  ]);
});
