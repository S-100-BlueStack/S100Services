export const MOCK_WORK_STREAMS = Object.freeze(
  Array.from({ length: 5 }, (_, index) =>
    Object.freeze({
      id: `DK${index + 1}`,
      name: `DK${index + 1}`,
      layerIds: Object.freeze([index + 4]),
    })
  )
);
