import { createDataSourceRegistry } from "../../dataSources/config/dataSourceRegistry.js";
import { createWorkspaceProductService } from "../../products/services/workspaceProductService.js";
import { createWorkspaceWorkUnitService } from "../../products/services/workspaceWorkUnitService.js";
import { normalizeElectronicProductResponse } from "../../data/normalizers/productResponse.js";

export const memberNames = ["Primary harbour", "Mapped legacy"];
export function validationArtifact(index, overrides = {}) {
  const id = index
    ? "22222222-2222-4222-8222-222222222222"
    : "11111111-1111-4111-8111-111111111111";
  return {
    Id: id,
    TrackId: index
      ? "44444444-4444-4444-8444-444444444444"
      : "33333333-3333-4333-8333-333333333333",
    RevisionId: "55555555-5555-4555-8555-555555555555",
    DatasetName: memberNames[index],
    ProductSpecification: index ? "S57" : "S101",
    Kind: "InternalValidationReport",
    FileName: index ? "Legacy report.xml" : "Primary report.xml",
    MediaType: "application/xml",
    CreatedAtUtc: "2026-10-08T06:00:00Z",
    Url: `/electronicproducts/${encodeURIComponent(memberNames[index])}/artifacts/${id}`,
    ...overrides,
  };
}
export function artifactHarness({
  response = { Data: [validationArtifact(0), validationArtifact(1)] },
} = {}) {
  const registry = createDataSourceRegistry();
  const calls = [];
  const state = { response, failMember: null, gate: null, edition: 1 };
  const metadata = (name) => ({
    Name: name,
    Status: name === memberNames[0] ? 8 : 11,
    Edition: state.edition,
    S101: { Name: memberNames[0] },
    S57: { Name: memberNames[1] },
  });
  const productService = createWorkspaceProductService({
    registry,
    loadTargetedProduct: async (name) => {
      const index = memberNames.indexOf(name);
      return {
        success: true,
        data: {
          Data: {
            Attributes: { DatasetName: name, ProductSpecification: index ? "S57" : "S101" },
            Geometry: {
              rings: [
                [
                  [10, 56],
                  [11, 56],
                  [11, 57],
                  [10, 56],
                ],
              ],
            },
          },
        },
      };
    },
  });
  const workspaceWorkUnitService = createWorkspaceWorkUnitService({
    registry,
    productService,
    fetchProduct: async (name) => ({
      success: true,
      data: normalizeElectronicProductResponse(metadata(name)),
    }),
  });
  const get = async (path) => {
    calls.push(path);
    const name = decodeURIComponent(path.split("/")[1]);
    if (!path.endsWith("/artifacts/history")) return { Data: metadata(name) };
    if (name === state.failMember) throw new Error("Validation artifacts unavailable");
    const acceptedResponse = state.response;
    const gate = state.gate;
    if (gate) {
      state.gate = null;
      gate.started.resolve();
      await gate.done.promise;
    }
    return acceptedResponse;
  };
  return { productService, workspaceWorkUnitService, get, calls, state };
}
