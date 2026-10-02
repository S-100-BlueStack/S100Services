export function createLiveEncAoi({
  datasetName = "101DK0041149E",
  s57DatasetName = "DK-WIRE-MAPPING-42",
  workflowStatus = 9,
  s101Status = 10,
  s57Status = 15,
  usageBand = 3,
  displayScale = 25000,
} = {}) {
  return {
    Geometry: JSON.stringify({
      rings: [
        [
          [10, 56],
          [11, 56],
          [11, 57],
          [10, 56],
        ],
      ],
      spatialReference: { wkid: 4326 },
    }),
    Attributes: {
      DatasetName: datasetName,
      Status: workflowStatus,
      DisplayScale: displayScale,
      UsageBand: usageBand,
      ErrorMessage: "Representative error",
      Package: {
        Layer: 1,
        SourceDatasetName: datasetName,
        UsageBand: usageBand,
        DisplayScale: displayScale,
        DetectedAtUtc: "2026-10-02T06:00:00Z",
        Status: 4,
        ErrorMessage: "Package error",
        S101: {
          DatasetName: datasetName,
          ProductSpecification: 1,
          CurrentEdition: 2,
          CurrentUpdate: 3,
          CandidateEdition: 2,
          CandidateUpdate: 4,
          Status: s101Status,
          Held: false,
          Discarded: false,
          ErrorMessage: null,
        },
        S57: {
          DatasetName: s57DatasetName,
          ProductSpecification: 0,
          CurrentEdition: 5,
          CurrentUpdate: 6,
          CandidateEdition: 5,
          CandidateUpdate: 7,
          Status: s57Status,
          Held: false,
          Discarded: false,
          ErrorMessage: "Member error",
        },
      },
    },
  };
}
