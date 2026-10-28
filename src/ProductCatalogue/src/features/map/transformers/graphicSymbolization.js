import { resolveCorrectionSymbol } from "../symbology/correctionSymbolResolver.js";

export function createGraphicProperties({ geometry, attributes, symbolization }) {
  return {
    geometry,
    attributes,
    symbol: resolveCorrectionSymbol({
      attributes,
      geometry,
      symbolization,
    }),
  };
}
